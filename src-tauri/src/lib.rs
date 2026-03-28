mod crypto;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Prevent EGL/DMABuf failures on Linux (Wayland + various GPU drivers)
  #[cfg(target_os = "linux")]
  if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
    unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      crypto::generate_encryption_key,
      crypto::has_encryption_key,
      crypto::store_encryption_key,
      crypto::get_encryption_key,
      crypto::delete_encryption_key,
      crypto::ensure_encryption_key,
      crypto::encrypt_with_keychain_key,
      crypto::decrypt_with_keychain_key,
      crypto::encrypt_with_key,
      crypto::decrypt_with_key,
      crypto::encrypt_with_password,
      crypto::decrypt_with_password,
      crypto::store_sync_password,
      crypto::get_sync_password,
      crypto::has_sync_password,
      crypto::delete_sync_password,
      crypto::store_sync_path,
      crypto::get_sync_path,
      crypto::has_sync_path,
      crypto::delete_sync_path,
      crypto::hmac_sha256,
      crypto::verify_hmac_sha256,
    ])
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(if cfg!(debug_assertions) {
          log::LevelFilter::Debug
        } else {
          log::LevelFilter::Warn
        })
        .build(),
    )
    .setup(|_app| Ok(()))
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
