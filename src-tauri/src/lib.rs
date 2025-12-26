mod crypto;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
      crypto::encrypt_with_keychain_key,
      crypto::decrypt_with_keychain_key,
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
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
