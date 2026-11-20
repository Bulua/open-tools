import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    en: { "x-download": { name: "X Video Downloader", desc: "Download original MP4 videos from public X (formerly Twitter) posts" } },
    ja: { "x-download": { name: "X 動画ダウンロード", desc: "X（旧 Twitter）の公開ポストから元の MP4 動画を保存" } },
  },
  messages: {
    "zh-CN": { video: {
      xPlaceholder: "粘贴 X 或 Twitter 的帖子链接，回车解析",
      xPasteTitle: "粘贴 X 帖子链接并解析",
      xEmptyHint: "在 X 中复制视频帖子的链接，粘贴到上方后回车",
      xEmptySub: "支持公开帖子中的 MP4 视频，同一帖中的多段视频会分别显示。",
      xQualityTip: "画质以帖子提供的档位为准，直接下载 MP4。",
      xInvalidLink: "找不到有效的 X 帖子链接，请粘贴 x.com 或 twitter.com 的完整帖子链接",
      xUnavailable: "无法读取这个帖子。它可能已删除、受限或无法公开嵌入。",
      xNoVideo: "帖子没有提供可下载的 MP4 视频",
      xInvalidFile: "下载内容不是有效的 MP4 文件，请重新解析链接后重试",
    } },
    en: { video: {
      xPlaceholder: "Paste an X or Twitter post link and press Enter",
      xPasteTitle: "Paste and parse an X post link",
      xEmptyHint: "Copy a video post link from X, paste it above, and press Enter",
      xEmptySub: "MP4 videos from public posts appear here. Each video in a post gets its own entry.",
      xQualityTip: "Download MP4 files at the resolutions provided by the post.",
      xInvalidLink: "No valid X post found. Paste a full post link from x.com or twitter.com",
      xUnavailable: "This post could not be read. It may be deleted, restricted, or unavailable for public embedding.",
      xNoVideo: "The post does not provide a downloadable MP4 video",
      xInvalidFile: "The download is not a valid MP4 file. Parse the link again and retry",
    } },
    ja: { video: {
      xPlaceholder: "X または Twitter のポストリンクを貼り付けて Enter",
      xPasteTitle: "X のポストリンクを貼り付けて解析",
      xEmptyHint: "X で動画付きポストのリンクをコピーし、上に貼り付けて Enter を押してください",
      xEmptySub: "公開ポストの MP4 動画を表示します。1 件に複数の動画がある場合は個別に表示します。",
      xQualityTip: "ポストで提供されている画質で MP4 をダウンロードします。",
      xInvalidLink: "有効な X のポストが見つかりません。x.com または twitter.com の完全なリンクを貼り付けてください",
      xUnavailable: "このポストを読み込めません。削除済み、閲覧制限付き、または公開埋め込みに対応していない可能性があります。",
      xNoVideo: "このポストにはダウンロード可能な MP4 動画がありません",
      xInvalidFile: "ダウンロードした内容は有効な MP4 ではありません。リンクを解析し直してください",
    } },
  },
});
