mod crypto;
mod files;

#[cfg(feature = "fuzzing")]
#[doc(hidden)]
pub fn fuzz_local_ciphertext(data: &[u8]) {
    crypto::fuzz_local_ciphertext(data);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Prevent EGL/DMABuf failures on Linux (Wayland + various GPU drivers)
    #[cfg(target_os = "linux")]
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        // SAFETY: this runs on the main thread before Tauri creates any worker threads.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            crypto::has_encryption_key,
            crypto::ensure_encryption_key,
            crypto::reset_encryption_key,
            crypto::encrypt_with_keychain_key,
            crypto::decrypt_with_keychain_key,
            crypto::encrypt_with_password,
            crypto::decrypt_with_password,
            crypto::encrypt_with_sync_password,
            crypto::decrypt_with_sync_password,
            crypto::store_sync_password,
            crypto::migrate_legacy_frontend_credentials,
            crypto::has_sync_password,
            crypto::delete_sync_password,
            crypto::store_sync_path,
            crypto::get_sync_path,
            crypto::has_sync_path,
            crypto::delete_sync_path,
            files::pick_backup_file,
            files::save_backup_file,
            files::sync_backup_exists,
            files::read_sync_backup,
            files::write_sync_backup,
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
