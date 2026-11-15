//! 直接测试实际文件引擎：编码保真、跨片段操作、原路径保存和失败保护。
use super::{
    buffer::{Buffer, BLOCK},
    document::Document,
    encoding::Encoding,
    index::{self, Index},
    save, service,
};
use std::path::PathBuf;
struct Fixture {
    dir: PathBuf,
    path: PathBuf,
}
impl Fixture {
    fn new(bytes: &[u8]) -> Self {
        let dir = std::env::temp_dir().join(format!("open-tools-test-{}", super::buffer::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.txt");
        std::fs::write(&path, bytes).unwrap();
        Self { dir, path }
    }
    fn open(&self, encoding: &str) -> Document {
        Document::open(&self.path, encoding, &self.dir.join("scratch")).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
fn read(doc: &Document) -> Vec<u8> {
    doc.buffer
        .view
        .read(0, doc.buffer.view.len as usize)
        .unwrap()
}
#[test]
fn mixed_newlines_and_unicode_preserve_untouched_bytes() {
    let f = Fixture::new(b"\xef\xbb\xbfalpha\r\n\xe4\xb8\xad\xe6\x96\x87\nlast\rtail");
    let mut doc = f.open("auto");
    let original = read(&doc);
    let index = Index::new(0, doc.bom, doc.buffer.view.len);
    let block = doc.block(doc.bom, &index, &|_| Ok(())).unwrap();
    assert_eq!(block.text, "alpha\n中文\nlast\ntail");
    doc.edit(0, block.start, block.end, "alpha\n中文🙂\nlast\ntail")
        .unwrap();
    assert_eq!(read(&doc), "\u{feff}alpha\r\n中文🙂\nlast\rtail".as_bytes());
    assert_eq!(std::fs::read(&f.path).unwrap(), original);
    assert!(doc.buffer.undo());
    assert_eq!(read(&doc), original);
    assert!(doc.buffer.redo());
}
#[test]
fn utf16_surrogates_bom_and_gbk_are_lossless() {
    for encoding in [Encoding::Utf16Le, Encoding::Utf16Be, Encoding::Gbk] {
        let mut bytes = match encoding {
            Encoding::Utf16Le => vec![0xff, 0xfe],
            Encoding::Utf16Be => vec![0xfe, 0xff],
            _ => vec![],
        };
        bytes.extend(encoding.encode("中文\r\nhello\n").unwrap());
        let f = Fixture::new(&bytes);
        let mut doc = f.open(if encoding == Encoding::Gbk {
            "Gbk"
        } else {
            "auto"
        });
        let block = doc
            .block(
                doc.bom,
                &Index::new(0, doc.bom, doc.buffer.view.len),
                &|_| Ok(()),
            )
            .unwrap();
        doc.edit(0, block.start, block.end, "中文\nworld\n")
            .unwrap();
        let mut expected = bytes[..doc.bom as usize].to_vec();
        expected.extend(encoding.encode("中文\r\nworld\n").unwrap());
        assert_eq!(read(&doc), expected);
        if encoding == Encoding::Gbk {
            let before = read(&doc);
            assert!(doc.edit(1, doc.bom, doc.buffer.view.len, "🙂").is_err());
            assert_eq!(read(&doc), before);
        }
    }
}
#[test]
fn piece_table_splices_and_history_cross_block_boundaries() {
    let f = Fixture::new(b"0123456789");
    let file = std::fs::File::open(&f.path).unwrap();
    let mut buffer = Buffer::new(file, 10, &f.dir.join("scratch")).unwrap();
    buffer.replace(2, 5, b"ABCD").unwrap();
    buffer.replace(1, 8, b"x").unwrap();
    assert_eq!(buffer.view.read(0, 99).unwrap(), b"0x789");
    assert!(buffer.undo());
    assert_eq!(buffer.view.read(0, 99).unwrap(), b"01ABCD56789");
    assert!(buffer.undo());
    assert!(!buffer.dirty());
    assert!(buffer.redo());
}
#[test]
fn search_crosses_io_chunks_and_sees_unsaved_edits() {
    let mut bytes = vec![b'a'; BLOCK - 2];
    bytes.extend_from_slice("中文 needle end".as_bytes());
    let f = Fixture::new(&bytes);
    let mut doc = f.open("Utf8");
    let found = index::search(&doc.buffer.view, doc.encoding, 0, "中文 needle", &|_| {
        Ok(())
    })
    .unwrap()
    .unwrap();
    assert_eq!(found.start, (BLOCK - 2) as u64);
    doc.buffer
        .replace(found.start, found.end, b"replacement")
        .unwrap();
    assert!(index::search(
        &doc.buffer.view,
        doc.encoding,
        0,
        "replacement",
        &|_| Ok(())
    )
    .unwrap()
    .is_some());
}
#[test]
fn giant_single_line_and_split_crlf_stay_bounded() {
    let mut bytes = vec![b'a'; BLOCK - 1];
    bytes.extend_from_slice(b"\r\nb\r\nc\n");
    let f = Fixture::new(&bytes);
    let doc = f.open("Utf8");
    let first = index::raw_block(&doc.buffer.view, doc.encoding, 0).unwrap();
    assert_eq!(first.len(), BLOCK - 1);
    let point = index::advance(doc.point(), &first, doc.encoding).unwrap();
    let rest = index::raw_block(&doc.buffer.view, doc.encoding, point.offset).unwrap();
    let end = index::advance(point, &rest, doc.encoding).unwrap();
    assert_eq!(end.line, 4);
    let offset =
        index::line_offset(&doc.buffer.view, doc.encoding, doc.point(), 3, &|_| Ok(())).unwrap();
    assert_eq!(offset, (BLOCK + 4) as u64);
}
#[test]
fn save_replaces_original_without_backup_and_supports_more_edits() {
    let f = Fixture::new(b"old\r\ntext");
    let mut doc = f.open("auto");
    doc.edit(0, 0, 9, "new\ntext").unwrap();
    let existing_backup = f.dir.join("existing.bak");
    std::fs::write(&existing_backup, b"user backup").unwrap();
    save::save(&mut doc, &|_| Ok(())).unwrap();
    assert_eq!(std::fs::read(&f.path).unwrap(), b"new\r\ntext");
    assert!(!std::fs::read_dir(&f.dir)
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| entry
            .file_name()
            .to_string_lossy()
            .starts_with(".open-tools-")));
    assert!(!doc.buffer.dirty());
    assert!(doc.buffer.undo());
    doc.revision += 1;
    assert!(doc.buffer.dirty());
    save::save(&mut doc, &|_| Ok(())).unwrap();
    assert_eq!(std::fs::read(&f.path).unwrap(), b"old\r\ntext");
    assert!(!std::fs::read_dir(&f.dir)
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| entry
            .file_name()
            .to_string_lossy()
            .starts_with(".open-tools-")));
    assert_eq!(std::fs::read(existing_backup).unwrap(), b"user backup");
}
#[test]
fn cancelled_save_and_stale_revision_do_not_touch_original() {
    let f = Fixture::new(b"original");
    let mut doc = f.open("auto");
    doc.edit(0, 0, 8, "changed").unwrap();
    assert!(doc.edit(0, 0, 7, "stale").is_err());
    assert!(save::save(&mut doc, &|_| Err("cancelled".into())).is_err());
    assert_eq!(std::fs::read(&f.path).unwrap(), b"original");
    assert!(doc.buffer.dirty());
    assert_eq!(
        std::fs::read_dir(&f.dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "tmp"))
            .count(),
        0
    );
}
#[test]
fn replacement_by_another_program_is_detected() {
    let f = Fixture::new(b"old");
    let mut doc = f.open("auto");
    doc.edit(0, 0, 3, "edited").unwrap();
    let other = f.dir.join("other");
    std::fs::write(&other, b"external").unwrap();
    #[cfg(unix)]
    std::fs::rename(&other, &f.path).unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide = |p: &std::path::Path| {
            p.as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect::<Vec<_>>()
        };
        assert_ne!(
            unsafe {
                windows_sys::Win32::Storage::FileSystem::ReplaceFileW(
                    wide(&f.path).as_ptr(),
                    wide(&other).as_ptr(),
                    std::ptr::null(),
                    0,
                    std::ptr::null(),
                    std::ptr::null(),
                )
            },
            0
        );
    }
    assert!(save::save(&mut doc, &|_| Ok(())).is_err());
    assert_eq!(std::fs::read(&f.path).unwrap(), b"external");
}
#[test]
fn sessions_refuse_to_close_pending_edits() {
    let f = Fixture::new(b"text");
    let opened = service::open(&f.path, "auto", &f.dir.join("scratch")).unwrap();
    let s = service::get(&opened.id).unwrap();
    s.pending.store(true, std::sync::atomic::Ordering::Release);
    assert!(service::close(&opened.id, false).is_err());
    service::close(&opened.id, true).unwrap();
    assert!(service::get(&opened.id).is_err());
}
#[test]
fn randomized_piece_edits_match_a_reference_buffer() {
    let f = Fixture::new(b"abcdefghijklmnopqrstuvwxyz");
    let mut buffer = Buffer::new(
        std::fs::File::open(&f.path).unwrap(),
        26,
        &f.dir.join("scratch"),
    )
    .unwrap();
    let mut expected = b"abcdefghijklmnopqrstuvwxyz".to_vec();
    let mut seed = 73u64;
    for _ in 0..200 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let from = seed as usize % (expected.len() + 1);
        seed = seed.rotate_left(7);
        let to = from + seed as usize % (expected.len() - from + 1);
        let add = vec![b'X'; seed as usize % 7];
        buffer.replace(from as u64, to as u64, &add).unwrap();
        expected.splice(from..to, add);
        assert_eq!(buffer.view.read(0, 9999).unwrap(), expected);
    }
}

#[test]
fn multibyte_characters_at_chunk_edges_roundtrip_in_all_encodings() {
    for encoding in [
        Encoding::Utf8,
        Encoding::Utf16Le,
        Encoding::Utf16Be,
        Encoding::Gbk,
    ] {
        let width = if matches!(encoding, Encoding::Utf16Le | Encoding::Utf16Be) {
            2
        } else {
            1
        };
        let special = if encoding == Encoding::Gbk {
            "中"
        } else {
            "🙂"
        };
        let text = format!("{}{}\r\nend", "a".repeat(BLOCK / width - 1), special);
        let bytes = encoding.encode(&text).unwrap();
        let f = Fixture::new(&bytes);
        let selected = match encoding {
            Encoding::Utf8 => "Utf8",
            Encoding::Utf16Le => "Utf16Le",
            Encoding::Utf16Be => "Utf16Be",
            Encoding::Gbk => "Gbk",
        };
        let doc = f.open(selected);
        let first = index::raw_block(&doc.buffer.view, encoding, 0).unwrap();
        let rest = index::raw_block(&doc.buffer.view, encoding, first.len() as u64).unwrap();
        assert_eq!(
            encoding.decode(&first).unwrap() + &encoding.decode(&rest).unwrap(),
            text
        );
        assert_eq!(
            *encoding
                .normalized(&rest)
                .unwrap()
                .positions
                .last()
                .unwrap(),
            rest.len()
        );
    }
}
#[test]
fn readonly_file_cannot_be_edited_or_saved() {
    let f = Fixture::new(b"original");
    let permissions = std::fs::metadata(&f.path).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    std::fs::set_permissions(&f.path, readonly).unwrap();
    let mut doc = f.open("auto");
    assert!(doc.info().readonly);
    assert!(doc.edit(0, 0, 8, "changed").is_err());
    assert!(save::save(&mut doc, &|_| Ok(())).is_err());
    assert_eq!(std::fs::read(&f.path).unwrap(), b"original");
    drop(doc);
    std::fs::set_permissions(&f.path, permissions).unwrap();
}
#[test]
fn empty_file_and_bom_only_file_can_be_edited_without_changing_the_bom() {
    for original in [&b""[..], &b"\xef\xbb\xbf"[..]] {
        let f = Fixture::new(original);
        let mut doc = f.open("auto");
        doc.edit(0, doc.bom, doc.bom, "新内容").unwrap();
        save::save(&mut doc, &|_| Ok(())).unwrap();
        let mut expected = original.to_vec();
        expected.extend_from_slice("新内容".as_bytes());
        assert_eq!(std::fs::read(&f.path).unwrap(), expected);
    }
}

#[test]
fn disjoint_edits_preserve_mixed_newlines_and_form_one_history_entry() {
    use super::document::Edit;
    let f = Fixture::new(b"a\r\nb\nc\rd");
    let mut doc = f.open("auto");
    doc.edit_changes(
        0,
        0,
        doc.buffer.view.len,
        "A\nb\nc\nD",
        &[
            Edit {
                from: 0,
                to: 1,
                text: "A".into(),
            },
            Edit {
                from: 6,
                to: 7,
                text: "D".into(),
            },
        ],
    )
    .unwrap();
    assert_eq!(read(&doc), b"A\r\nb\nc\rD");
    assert!(doc.buffer.undo());
    assert_eq!(read(&doc), b"a\r\nb\nc\rd");
    assert!(!doc.buffer.can_undo());
    assert!(doc.buffer.redo());
    assert_eq!(read(&doc), b"A\r\nb\nc\rD");
}
#[test]
fn invalid_edit_batches_leave_document_and_history_unchanged() {
    use super::document::Edit;
    let f = Fixture::new("a🙂b".as_bytes());
    let mut doc = f.open("Utf8");
    for (text, changes) in [
        (
            "wrong",
            vec![Edit {
                from: 0,
                to: 1,
                text: "A".into(),
            }],
        ),
        (
            "aXb",
            vec![Edit {
                from: 1,
                to: 2,
                text: "X".into(),
            }],
        ),
        (
            "AXB",
            vec![
                Edit {
                    from: 4,
                    to: 4,
                    text: "X".into(),
                },
                Edit {
                    from: 0,
                    to: 1,
                    text: "A".into(),
                },
            ],
        ),
    ] {
        assert!(doc
            .edit_changes(0, 0, doc.buffer.view.len, text, &changes)
            .is_err());
        assert_eq!(read(&doc), "a🙂b".as_bytes());
        assert!(!doc.buffer.can_undo());
        assert_eq!(doc.revision, 0);
    }
    let gbk = Fixture::new(b"abc");
    let mut doc = gbk.open("Gbk");
    assert!(doc
        .edit_changes(
            0,
            0,
            3,
            "Ab🙂",
            &[
                Edit {
                    from: 0,
                    to: 1,
                    text: "A".into()
                },
                Edit {
                    from: 2,
                    to: 3,
                    text: "🙂".into()
                },
            ]
        )
        .is_err());
    assert_eq!(read(&doc), b"abc");
    assert!(!doc.buffer.can_undo());
}
#[test]
fn buffer_batch_failure_rolls_back_earlier_splices() {
    let f = Fixture::new(b"abc");
    let mut doc = f.open("auto");
    assert!(doc
        .buffer
        .replace_many(&[(2, 3, b"C".to_vec()), (0, 99, b"A".to_vec())])
        .is_err());
    assert_eq!(read(&doc), b"abc");
    assert!(!doc.buffer.can_undo());
    assert!(!doc.buffer.dirty());
}

#[test]
fn bounded_reads_join_without_gaps_for_multibyte_text_and_mixed_newlines() {
    for encoding in [
        Encoding::Utf8,
        Encoding::Utf16Le,
        Encoding::Utf16Be,
        Encoding::Gbk,
    ] {
        let text = "中a\r\nb文\nc\rd";
        let bytes = encoding.encode(text).unwrap();
        let f = Fixture::new(&bytes);
        let selected = match encoding {
            Encoding::Utf8 => "Utf8",
            Encoding::Utf16Le => "Utf16Le",
            Encoding::Utf16Be => "Utf16Be",
            Encoding::Gbk => "Gbk",
        };
        let doc = f.open(selected);
        let index = Index::new(0, 0, bytes.len() as u64);
        let split = encoding.encode("中a\r\nb文\n").unwrap().len() as u64;
        let first = doc.block_to(0, split, &index, &|_| Ok(())).unwrap();
        let rest = doc.block(split, &index, &|_| Ok(())).unwrap();
        assert_eq!(first.end, rest.start);
        assert_eq!(first.text + &rest.text, "中a\nb文\nc\nd");
        assert_eq!(rest.first_line, 3);
        assert!(doc
            .block_to(0, bytes.len() as u64 + 1, &index, &|_| Ok(()))
            .is_err());
        assert!(doc.block_to(split + 1, split, &index, &|_| Ok(())).is_err());
    }
}

#[test]
fn multiple_sessions_keep_encoding_edits_and_lifecycle_independent() {
    let a = Fixture::new(b"alpha");
    let b = Fixture::new(b"bravo");
    let opened_a = service::open(&a.path, "Utf8", &a.dir.join("scratch")).unwrap();
    let opened_b = service::open(&b.path, "Gbk", &b.dir.join("scratch")).unwrap();
    assert_ne!(opened_a.id, opened_b.id);
    let first = service::get(&opened_a.id).unwrap();
    first
        .run("edit", |doc, _| {
            doc.edit(0, 0, 5, "ALPHA")?;
            Ok(())
        })
        .unwrap();
    let second = service::get(&opened_b.id).unwrap();
    {
        let doc = second.document.lock().unwrap();
        assert_eq!(doc.encoding, Encoding::Gbk);
        assert_eq!(read(&doc), b"bravo");
        assert!(!doc.buffer.dirty());
    }
    service::close(&opened_a.id, true).unwrap();
    assert!(service::get(&opened_b.id).is_ok());
    service::close(&opened_b.id, true).unwrap();
}
