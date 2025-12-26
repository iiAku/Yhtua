use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use keyring::Entry;
use rand::RngCore;
use ring::{
    aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN},
    pbkdf2,
};
use std::fs;
use std::num::NonZeroU32;
use std::path::PathBuf;
use thiserror::Error;

const KEYCHAIN_SERVICE: &str = "yhtua";
const KEYCHAIN_KEY_NAME: &str = "encryption-key";
const KEYCHAIN_SYNC_PASSWORD: &str = "sync-password";
const KEYCHAIN_SYNC_PATH: &str = "sync-path";
const PBKDF2_ITERATIONS: u32 = 600_000;
const SALT_LEN: usize = 16;
const KEY_LEN: usize = 32;

const FALLBACK_DIR: &str = ".yhtua";
const FALLBACK_CREDS_FILE: &str = "credentials.enc";

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Keychain error: {0}")]
    Keychain(String),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Decryption error: {0}")]
    Decryption(String),
    #[error("Invalid data format")]
    InvalidFormat,
    #[error("Storage error: {0}")]
    Storage(String),
}

impl serde::Serialize for CryptoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn get_fallback_path() -> Result<PathBuf, CryptoError> {
    let home = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| CryptoError::Storage("Cannot find home directory".into()))?;
    Ok(home.join(FALLBACK_DIR))
}

fn get_credentials_file_path() -> Result<PathBuf, CryptoError> {
    Ok(get_fallback_path()?.join(FALLBACK_CREDS_FILE))
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct FallbackCredentials {
    encryption_key: Option<String>,
    sync_password: Option<String>,
    sync_path: Option<String>,
}

fn get_fallback_encryption_key() -> [u8; KEY_LEN] {
    let username = whoami::username();
    let hostname = whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string());
    let device_id = format!("yhtua-fallback-{}-{}", username, hostname);

    let salt = b"yhtua-fallback-salt-v1";
    let mut key = [0u8; KEY_LEN];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(10_000).unwrap(),
        salt,
        device_id.as_bytes(),
        &mut key,
    );
    key
}

fn read_fallback_credentials() -> FallbackCredentials {
    let path = match get_credentials_file_path() {
        Ok(p) => p,
        Err(_) => return FallbackCredentials::default(),
    };

    if !path.exists() {
        return FallbackCredentials::default();
    }

    match fs::read_to_string(&path) {
        Ok(encrypted_content) => {
            let key = get_fallback_encryption_key();
            match decrypt_aes256gcm(&encrypted_content, &key) {
                Ok(decrypted) => serde_json::from_str(&decrypted).unwrap_or_default(),
                Err(_) => FallbackCredentials::default(),
            }
        }
        Err(_) => FallbackCredentials::default(),
    }
}

fn write_fallback_credentials(creds: &FallbackCredentials) -> Result<(), CryptoError> {
    let dir = get_fallback_path()?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CryptoError::Storage(format!("Cannot create directory: {}", e)))?;
    }

    let path = get_credentials_file_path()?;
    let json = serde_json::to_string(creds)
        .map_err(|e| CryptoError::Storage(format!("Cannot serialize: {}", e)))?;

    let key = get_fallback_encryption_key();
    let encrypted = encrypt_aes256gcm(&json, &key)?;

    fs::write(&path, encrypted)
        .map_err(|e| CryptoError::Storage(format!("Cannot write file: {}", e)))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn get_keyring_entry(name: &str) -> Result<Entry, CryptoError> {
    Entry::new(KEYCHAIN_SERVICE, name).map_err(|e| CryptoError::Keychain(e.to_string()))
}

fn get_credential(name: &str) -> Option<String> {
    if let Ok(entry) = get_keyring_entry(name) {
        if let Ok(value) = entry.get_password() {
            return Some(value);
        }
    }

    let creds = read_fallback_credentials();
    match name {
        KEYCHAIN_KEY_NAME => creds.encryption_key,
        KEYCHAIN_SYNC_PASSWORD => creds.sync_password,
        KEYCHAIN_SYNC_PATH => creds.sync_path,
        _ => None,
    }
}

fn store_credential(name: &str, value: &str) -> Result<(), CryptoError> {
    let keyring_result = get_keyring_entry(name).and_then(|entry| {
        entry
            .set_password(value)
            .map_err(|e| CryptoError::Keychain(e.to_string()))
    });

    if keyring_result.is_ok() {
        return Ok(());
    }

    log::warn!(
        "Keyring storage failed, using file fallback: {:?}",
        keyring_result.err()
    );
    let mut creds = read_fallback_credentials();
    match name {
        KEYCHAIN_KEY_NAME => creds.encryption_key = Some(value.to_string()),
        KEYCHAIN_SYNC_PASSWORD => creds.sync_password = Some(value.to_string()),
        KEYCHAIN_SYNC_PATH => creds.sync_path = Some(value.to_string()),
        _ => {}
    }
    write_fallback_credentials(&creds)
}

fn has_credential(name: &str) -> bool {
    get_credential(name).is_some()
}

fn delete_credential(name: &str) -> Result<(), CryptoError> {
    if let Ok(entry) = get_keyring_entry(name) {
        let _ = entry.delete_credential();
    }

    let mut creds = read_fallback_credentials();
    match name {
        KEYCHAIN_KEY_NAME => creds.encryption_key = None,
        KEYCHAIN_SYNC_PASSWORD => creds.sync_password = None,
        KEYCHAIN_SYNC_PATH => creds.sync_path = None,
        _ => {}
    }
    write_fallback_credentials(&creds)
}

fn generate_random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

#[tauri::command]
pub fn generate_encryption_key() -> String {
    let key = generate_random_bytes(KEY_LEN);
    BASE64.encode(&key)
}

#[tauri::command]
pub fn has_encryption_key() -> bool {
    has_credential(KEYCHAIN_KEY_NAME)
}

#[tauri::command]
pub fn store_encryption_key(key_base64: String) -> Result<(), CryptoError> {
    store_credential(KEYCHAIN_KEY_NAME, &key_base64)
}

#[tauri::command]
pub fn get_encryption_key() -> Result<String, CryptoError> {
    get_credential(KEYCHAIN_KEY_NAME)
        .ok_or_else(|| CryptoError::Keychain("No encryption key found".into()))
}

#[tauri::command]
pub fn delete_encryption_key() -> Result<(), CryptoError> {
    delete_credential(KEYCHAIN_KEY_NAME)
}

#[tauri::command]
pub fn encrypt_with_keychain_key(plaintext: String) -> Result<String, CryptoError> {
    let key_base64 = get_encryption_key()?;
    let key_bytes = BASE64
        .decode(&key_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;

    encrypt_aes256gcm(&plaintext, &key_bytes)
}

#[tauri::command]
pub fn decrypt_with_keychain_key(ciphertext_base64: String) -> Result<String, CryptoError> {
    let key_base64 = get_encryption_key()?;
    let key_bytes = BASE64
        .decode(&key_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;

    decrypt_aes256gcm(&ciphertext_base64, &key_bytes)
}

fn derive_key_from_password(password: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(PBKDF2_ITERATIONS).unwrap(),
        salt,
        password.as_bytes(),
        &mut key,
    );
    key
}

#[tauri::command]
pub fn encrypt_with_password(plaintext: String, password: String) -> Result<String, CryptoError> {
    let salt = generate_random_bytes(SALT_LEN);
    let key = derive_key_from_password(&password, &salt);

    let nonce_bytes = generate_random_bytes(NONCE_LEN);

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, &key).map_err(|_| CryptoError::Encryption("Key error".into()))?;
    let sealing_key = LessSafeKey::new(unbound_key);

    let nonce =
        Nonce::try_assume_unique_for_key(&nonce_bytes).map_err(|_| CryptoError::Encryption("Nonce error".into()))?;

    let mut in_out = plaintext.into_bytes();
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CryptoError::Encryption("Seal error".into()))?;

    let mut combined = Vec::with_capacity(SALT_LEN + NONCE_LEN + in_out.len());
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&in_out);

    Ok(BASE64.encode(&combined))
}

#[tauri::command]
pub fn decrypt_with_password(
    ciphertext_base64: String,
    password: String,
) -> Result<String, CryptoError> {
    let combined = BASE64
        .decode(&ciphertext_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;

    if combined.len() < SALT_LEN + NONCE_LEN + 16 {
        return Err(CryptoError::InvalidFormat);
    }

    let salt = &combined[..SALT_LEN];
    let nonce_bytes = &combined[SALT_LEN..SALT_LEN + NONCE_LEN];
    let ciphertext = &combined[SALT_LEN + NONCE_LEN..];

    let key = derive_key_from_password(&password, salt);

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, &key).map_err(|_| CryptoError::Decryption("Key error".into()))?;
    let opening_key = LessSafeKey::new(unbound_key);

    let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
        .map_err(|_| CryptoError::Decryption("Nonce error".into()))?;

    let mut in_out = ciphertext.to_vec();
    let plaintext = opening_key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CryptoError::Decryption("Wrong password or corrupted data".into()))?;

    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption("Invalid UTF-8".into()))
}

fn encrypt_aes256gcm(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let nonce_bytes = generate_random_bytes(NONCE_LEN);

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, key).map_err(|_| CryptoError::Encryption("Key error".into()))?;
    let sealing_key = LessSafeKey::new(unbound_key);

    let nonce =
        Nonce::try_assume_unique_for_key(&nonce_bytes).map_err(|_| CryptoError::Encryption("Nonce error".into()))?;

    let mut in_out = plaintext.as_bytes().to_vec();
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CryptoError::Encryption("Seal error".into()))?;

    let mut combined = Vec::with_capacity(NONCE_LEN + in_out.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&in_out);

    Ok(BASE64.encode(&combined))
}

fn decrypt_aes256gcm(ciphertext_base64: &str, key: &[u8]) -> Result<String, CryptoError> {
    let combined = BASE64
        .decode(ciphertext_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;

    if combined.len() < NONCE_LEN + 16 {
        return Err(CryptoError::InvalidFormat);
    }

    let nonce_bytes = &combined[..NONCE_LEN];
    let ciphertext = &combined[NONCE_LEN..];

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, key).map_err(|_| CryptoError::Decryption("Key error".into()))?;
    let opening_key = LessSafeKey::new(unbound_key);

    let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
        .map_err(|_| CryptoError::Decryption("Nonce error".into()))?;

    let mut in_out = ciphertext.to_vec();
    let plaintext = opening_key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption("Invalid UTF-8".into()))
}

#[tauri::command]
pub fn store_sync_password(password: String) -> Result<(), CryptoError> {
    store_credential(KEYCHAIN_SYNC_PASSWORD, &password)
}

#[tauri::command]
pub fn get_sync_password() -> Result<String, CryptoError> {
    get_credential(KEYCHAIN_SYNC_PASSWORD)
        .ok_or_else(|| CryptoError::Keychain("No sync password found".into()))
}

#[tauri::command]
pub fn has_sync_password() -> bool {
    has_credential(KEYCHAIN_SYNC_PASSWORD)
}

#[tauri::command]
pub fn delete_sync_password() -> Result<(), CryptoError> {
    delete_credential(KEYCHAIN_SYNC_PASSWORD)
}

#[tauri::command]
pub fn store_sync_path(path: String) -> Result<(), CryptoError> {
    store_credential(KEYCHAIN_SYNC_PATH, &path)
}

#[tauri::command]
pub fn get_sync_path() -> Result<String, CryptoError> {
    get_credential(KEYCHAIN_SYNC_PATH)
        .ok_or_else(|| CryptoError::Keychain("No sync path found".into()))
}

#[tauri::command]
pub fn has_sync_path() -> bool {
    has_credential(KEYCHAIN_SYNC_PATH)
}

#[tauri::command]
pub fn delete_sync_path() -> Result<(), CryptoError> {
    delete_credential(KEYCHAIN_SYNC_PATH)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_with_password() {
        let plaintext = "Hello, World! This is a secret.";
        let password = "my_secure_password";

        let encrypted = encrypt_with_password(plaintext.to_string(), password.to_string()).unwrap();
        let decrypted = decrypt_with_password(encrypted, password.to_string()).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_wrong_password_fails() {
        let plaintext = "Secret data";
        let password = "correct_password";
        let wrong_password = "wrong_password";

        let encrypted = encrypt_with_password(plaintext.to_string(), password.to_string()).unwrap();
        let result = decrypt_with_password(encrypted, wrong_password.to_string());

        assert!(result.is_err());
    }

    #[test]
    fn test_key_generation() {
        let key = generate_encryption_key();
        let decoded = BASE64.decode(&key).unwrap();
        assert_eq!(decoded.len(), KEY_LEN);
    }
}
