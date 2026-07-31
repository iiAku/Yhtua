use atomic_write_file::OpenOptions;
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use thiserror::Error;

use crate::crypto;

const BACKUP_FILENAME: &str = "yhtua_backup.json";
const SAFETY_PREFIX: &str = "yhtua_backup.";
const SAFETY_SUFFIX: &str = ".bak.json";
const SAFETY_KEEP: usize = 5;
const MAX_BACKUP_BYTES: usize = 24 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum FileError {
    #[error("Backup file is too large")]
    TooLarge,
    #[error("Backup path is invalid")]
    InvalidPath,
    #[error("Backup file operation failed")]
    Io,
    #[error("Secure sync configuration is unavailable")]
    Configuration,
}

impl Serialize for FileError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn validate_content(content: &str) -> Result<(), FileError> {
    if content.len() > MAX_BACKUP_BYTES {
        return Err(FileError::TooLarge);
    }
    Ok(())
}

fn read_regular_file(path: &Path) -> Result<String, FileError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| FileError::Io)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(FileError::InvalidPath);
    }
    if metadata.len() > MAX_BACKUP_BYTES as u64 {
        return Err(FileError::TooLarge);
    }
    let content = fs::read_to_string(path).map_err(|_| FileError::Io)?;
    validate_content(&content)?;
    Ok(content)
}

fn atomic_write(path: &Path, content: &str) -> Result<(), FileError> {
    validate_content(content)?;
    let parent = path.parent().ok_or(FileError::InvalidPath)?;
    let parent_metadata = fs::symlink_metadata(parent).map_err(|_| FileError::InvalidPath)?;
    if parent_metadata.file_type().is_symlink() || !parent_metadata.is_dir() {
        return Err(FileError::InvalidPath);
    }
    if path.exists() {
        let metadata = fs::symlink_metadata(path).map_err(|_| FileError::Io)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(FileError::InvalidPath);
        }
    }

    let mut options = OpenOptions::new();
    #[cfg(unix)]
    {
        use atomic_write_file::unix::OpenOptionsExt;
        use std::os::unix::fs::OpenOptionsExt as _;
        options.preserve_mode(false).mode(0o600);
    }
    let mut file = options.open(path).map_err(|_| FileError::Io)?;
    file.write_all(content.as_bytes())
        .map_err(|_| FileError::Io)?;
    file.commit().map_err(|_| FileError::Io)
}

fn dialog_path_to_path_buf(path: tauri_plugin_dialog::FilePath) -> Result<PathBuf, FileError> {
    path.into_path().map_err(|_| FileError::InvalidPath)
}

#[tauri::command]
pub async fn pick_backup_file(app: AppHandle) -> Result<Option<String>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Import Yhtua backup")
            .add_filter("Yhtua backup", &["json"])
            .blocking_pick_file();
        selected
            .map(dialog_path_to_path_buf)
            .transpose()?
            .map(|path| read_regular_file(&path))
            .transpose()
    })
    .await
    .map_err(|_| FileError::Io)?
}

#[tauri::command]
pub async fn save_backup_file(app: AppHandle, content: String) -> Result<bool, FileError> {
    validate_content(&content)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Export encrypted Yhtua backup")
            .set_file_name(BACKUP_FILENAME)
            .add_filter("Yhtua backup", &["json"])
            .blocking_save_file();
        let Some(path) = selected else {
            return Ok(false);
        };
        let path = dialog_path_to_path_buf(path)?;
        atomic_write(&path, &content)?;
        Ok(true)
    })
    .await
    .map_err(|_| FileError::Io)?
}

fn sync_directory() -> Result<PathBuf, FileError> {
    let configured = crypto::get_sync_directory().map_err(|_| FileError::Configuration)?;
    let metadata = fs::symlink_metadata(&configured).map_err(|_| FileError::InvalidPath)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(FileError::InvalidPath);
    }
    configured
        .canonicalize()
        .map_err(|_| FileError::InvalidPath)
}

fn sync_backup_path() -> Result<PathBuf, FileError> {
    Ok(sync_directory()?.join(BACKUP_FILENAME))
}

#[tauri::command]
pub fn sync_backup_exists() -> Result<bool, FileError> {
    let path = sync_backup_path()?;
    if !path.exists() {
        return Ok(false);
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| FileError::Io)?;
    Ok(metadata.is_file() && !metadata.file_type().is_symlink())
}

#[tauri::command]
pub fn read_sync_backup() -> Result<Option<String>, FileError> {
    let path = sync_backup_path()?;
    if !path.exists() {
        return Ok(None);
    }
    read_regular_file(&path).map(Some)
}

fn safety_backup_name() -> Result<String, FileError> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| FileError::Io)?
        .as_nanos();
    Ok(format!("{SAFETY_PREFIX}{timestamp}{SAFETY_SUFFIX}"))
}

fn prune_safety_backups(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut backups: Vec<PathBuf> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if is_safety_backup_name(&name) {
                Some(entry.path())
            } else {
                None
            }
        })
        .collect();
    backups.sort();
    let stale_count = backups.len().saturating_sub(SAFETY_KEEP);
    for path in backups.into_iter().take(stale_count) {
        if let Ok(metadata) = fs::symlink_metadata(&path)
            && metadata.is_file()
            && !metadata.file_type().is_symlink()
        {
            let _ = fs::remove_file(path);
        }
    }
}

fn is_safety_backup_name(name: &str) -> bool {
    name.starts_with(SAFETY_PREFIX) && name.ends_with(SAFETY_SUFFIX)
}

#[tauri::command]
pub fn write_sync_backup(content: String) -> Result<(), FileError> {
    validate_content(&content)?;
    let directory = sync_directory()?;
    write_sync_backup_to_directory(&directory, &content)
}

fn write_sync_backup_to_directory(directory: &Path, content: &str) -> Result<(), FileError> {
    let primary = directory.join(BACKUP_FILENAME);
    if primary.exists() {
        let previous = read_regular_file(&primary)?;
        atomic_write(&directory.join(safety_backup_name()?), &previous)?;
    }
    atomic_write(&primary, content)?;
    prune_safety_backups(directory);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_directory() -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "yhtua-files-test-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("unnamed")
        ));
        fs::create_dir_all(&directory).expect("test directory is created");
        directory
    }

    #[test]
    fn atomic_write_replaces_complete_content() {
        let directory = test_directory();
        let path = directory.join("backup.json");
        atomic_write(&path, "old").expect("first write succeeds");
        atomic_write(&path, "new").expect("replacement succeeds");
        assert_eq!(read_regular_file(&path).expect("read succeeds"), "new");
        fs::remove_dir_all(directory).expect("test directory is removed");
    }

    #[test]
    fn sync_overwrite_preserves_the_previous_complete_backup() {
        let directory = test_directory();
        write_sync_backup_to_directory(&directory, "first").expect("first write succeeds");
        write_sync_backup_to_directory(&directory, "second").expect("second write succeeds");
        assert_eq!(
            read_regular_file(&directory.join(BACKUP_FILENAME)).expect("primary read succeeds"),
            "second"
        );
        let safety_contents: Vec<String> = fs::read_dir(&directory)
            .expect("directory read succeeds")
            .flatten()
            .filter(|entry| is_safety_backup_name(&entry.file_name().to_string_lossy()))
            .map(|entry| read_regular_file(&entry.path()).expect("safety read succeeds"))
            .collect();
        assert_eq!(safety_contents, vec!["first".to_owned()]);
        fs::remove_dir_all(directory).expect("test directory is removed");
    }

    #[test]
    fn oversized_content_is_rejected() {
        let oversized = "x".repeat(MAX_BACKUP_BYTES + 1);
        assert!(matches!(
            validate_content(&oversized),
            Err(FileError::TooLarge)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_inputs_are_rejected() {
        use std::os::unix::fs::symlink;
        let directory = test_directory();
        let target = directory.join("target.json");
        let link = directory.join("link.json");
        fs::write(&target, "secret").expect("target is written");
        symlink(&target, &link).expect("symlink is created");
        assert!(matches!(
            read_regular_file(&link),
            Err(FileError::InvalidPath)
        ));
        fs::remove_dir_all(directory).expect("test directory is removed");
    }
}
