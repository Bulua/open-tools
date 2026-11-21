fn main() {
    assert_eq!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows"),
        "Open Tools only supports Windows targets"
    );
    tauri_build::build()
}
