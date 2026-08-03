use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use keyring::{Entry, Error as KeyringError};
use ring::{
    aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey},
    pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use std::{
    fs,
    num::NonZeroU32,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

const KEYCHAIN_SERVICE: &str = "com.yhtua.dev";
const KEYCHAIN_KEY_NAME: &str = "encryption-key";
const KEYCHAIN_SYNC_PASSWORD: &str = "sync-password";
const KEYCHAIN_SYNC_PATH: &str = "sync-path";

const LEGACY_KEYCHAIN_SERVICE: &str = "yhtua";
const LEGACY_PBKDF2_ITERATIONS: u32 = 600_000;
const SALT_LEN: usize = 16;
const KEY_LEN: usize = 32;
const TAG_LEN: usize = 16;
const PASSWORD_FORMAT_MAGIC: &[u8; 4] = b"YHP2";
const LOCAL_FORMAT_MAGIC: &[u8; 4] = b"YHL2";
const PASSWORD_AAD: &[u8] = b"yhtua-password-backup-v2";
const LOCAL_AAD: &[u8] = b"yhtua-local-secret-v2";
const ARGON2_MEMORY_KIB: u32 = 64 * 1024;
const ARGON2_ITERATIONS: u32 = 3;
const ARGON2_PARALLELISM: u32 = 1;
const MAX_SECRET_BYTES: usize = 4 * 1024;
const MAX_BACKUP_BYTES: usize = 16 * 1024 * 1024;
const MAX_CIPHERTEXT_BASE64_BYTES: usize = 24 * 1024 * 1024;
const MAX_PASSWORD_BYTES: usize = 1024;

const LEGACY_FALLBACK_DIR: &str = ".yhtua";
const LEGACY_FALLBACK_CREDS_FILE: &str = "credentials.enc";

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Secure credential storage is unavailable")]
    Keychain,
    #[error("Encryption key is missing")]
    MissingEncryptionKey,
    #[error("Encryption failed")]
    Encryption,
    #[error("Decryption failed")]
    Decryption,
    #[error("Invalid data format")]
    InvalidFormat,
    #[error("Input exceeds the allowed size")]
    InputTooLarge,
    #[error("Password must contain between 8 and 1024 bytes")]
    InvalidPassword,
    #[error("Storage operation failed")]
    Storage,
    #[error("Internal error")]
    Internal,
}

impl serde::Serialize for CryptoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Default, Zeroize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
struct LegacyFallbackCredentials {
    encryption_key: Option<String>,
    sync_password: Option<String>,
    sync_path: Option<String>,
}

fn legacy_fallback_path() -> Result<PathBuf, CryptoError> {
    let data_dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .ok_or(CryptoError::Storage)?;
    Ok(data_dir
        .join(LEGACY_FALLBACK_DIR)
        .join(LEGACY_FALLBACK_CREDS_FILE))
}

fn derive_legacy_key(password: &[u8], salt: &[u8], iterations: u32) -> [u8; KEY_LEN] {
    let mut key = [0_u8; KEY_LEN];
    let iterations = NonZeroU32::new(iterations).expect("iteration count is a non-zero constant");
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        iterations,
        salt,
        password,
        &mut key,
    );
    key
}

fn legacy_fallback_encryption_key() -> Zeroizing<[u8; KEY_LEN]> {
    let username = whoami::username().unwrap_or_else(|_| "unknown".to_owned());
    let hostname = whoami::hostname().unwrap_or_else(|_| "unknown".to_owned());
    let device_id = Zeroizing::new(format!("yhtua-fallback-{username}-{hostname}"));
    Zeroizing::new(derive_legacy_key(
        device_id.as_bytes(),
        b"yhtua-fallback-salt-v1",
        LEGACY_PBKDF2_ITERATIONS,
    ))
}

/// Set once the legacy credential file has been found unusable, so the 600k-round
/// PBKDF2 derivation behind that verdict is not repeated on every credential
/// lookup that falls through to migration.
static LEGACY_FALLBACK_UNUSABLE: AtomicBool = AtomicBool::new(false);

/// Reads the pre-2.7.1 credential file, if one is still readable.
///
/// This file is an optional upgrade path, so every failure to read it means
/// "nothing to migrate" rather than an error. It is keyed by username+hostname
/// (`legacy_fallback_encryption_key`), so renaming the machine makes it
/// permanently undecryptable — and propagating that failure used to poison every
/// credential lookup that fell through to migration, leaving the app unable to
/// read *or create* its encryption key. The file is left on disk: it may become
/// readable again if the original hostname comes back.
fn read_legacy_fallback_credentials() -> Option<LegacyFallbackCredentials> {
    if LEGACY_FALLBACK_UNUSABLE.load(Ordering::Relaxed) {
        return None;
    }

    let path = legacy_fallback_path().ok()?;
    if !path.exists() {
        return None;
    }

    let metadata = fs::symlink_metadata(&path).ok()?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        log::warn!("Ignoring a legacy credential path that is not a regular file");
        LEGACY_FALLBACK_UNUSABLE.store(true, Ordering::Relaxed);
        return None;
    }

    let encrypted = fs::read_to_string(&path).ok()?;
    let credentials = decode_legacy_fallback_credentials(&encrypted);
    if credentials.is_none() {
        LEGACY_FALLBACK_UNUSABLE.store(true, Ordering::Relaxed);
    }
    credentials
}

/// Split from the file read so it can be tested without touching the real
/// credential file, which lives in the user's data directory.
fn decode_legacy_fallback_credentials(encrypted: &str) -> Option<LegacyFallbackCredentials> {
    if encrypted.len() > MAX_CIPHERTEXT_BASE64_BYTES {
        log::warn!("Ignoring an oversized legacy credential file");
        return None;
    }
    let key = legacy_fallback_encryption_key();
    let decrypted = match decrypt_local_legacy(encrypted, key.as_ref()) {
        Ok(decrypted) => Zeroizing::new(decrypted),
        Err(_) => {
            log::warn!(
                "Legacy credential file cannot be decrypted on this device (the machine name may have changed); skipping migration"
            );
            return None;
        }
    };
    match serde_json::from_str(&decrypted) {
        Ok(credentials) => Some(credentials),
        Err(_) => {
            log::warn!("Legacy credential file is malformed; skipping migration");
            None
        }
    }
}

fn keyring_entry(service: &str, name: &str) -> Result<Entry, CryptoError> {
    Entry::new(service, name).map_err(|error| {
        log::warn!("Unable to create an OS credential entry: {error}");
        CryptoError::Keychain
    })
}

trait CredentialBackend {
    fn get(&self, service: &str, name: &str) -> Result<Option<Zeroizing<String>>, CryptoError>;
    fn set(&self, service: &str, name: &str, value: &str) -> Result<(), CryptoError>;
    fn delete(&self, service: &str, name: &str) -> Result<(), CryptoError>;
}

struct OsCredentialBackend;

impl CredentialBackend for OsCredentialBackend {
    fn get(&self, service: &str, name: &str) -> Result<Option<Zeroizing<String>>, CryptoError> {
        match keyring_entry(service, name)?.get_password() {
            Ok(value) => Ok(Some(Zeroizing::new(value))),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => {
                log::warn!("Unable to read an OS credential: {error}");
                Err(CryptoError::Keychain)
            }
        }
    }

    fn set(&self, service: &str, name: &str, value: &str) -> Result<(), CryptoError> {
        let entry = keyring_entry(service, name)?;
        entry.set_password(value).map_err(|error| {
            log::warn!("Unable to write an OS credential: {error}");
            CryptoError::Keychain
        })?;
        let stored = Zeroizing::new(entry.get_password().map_err(|error| {
            log::warn!("Unable to verify an OS credential: {error}");
            CryptoError::Keychain
        })?);
        if stored.as_str() != value {
            return Err(CryptoError::Keychain);
        }
        Ok(())
    }

    fn delete(&self, service: &str, name: &str) -> Result<(), CryptoError> {
        match keyring_entry(service, name)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => {
                log::warn!("Unable to delete an OS credential: {error}");
                Err(CryptoError::Keychain)
            }
        }
    }
}

fn migrate_legacy_credentials<B: CredentialBackend>(backend: &B) -> Result<bool, CryptoError> {
    let Some(credentials) = read_legacy_fallback_credentials() else {
        return Ok(false);
    };

    for (name, value) in [
        (KEYCHAIN_KEY_NAME, credentials.encryption_key.as_deref()),
        (KEYCHAIN_SYNC_PASSWORD, credentials.sync_password.as_deref()),
        (KEYCHAIN_SYNC_PATH, credentials.sync_path.as_deref()),
    ] {
        if let Some(value) = value {
            validate_legacy_credential_value(name, value)?;
        }
    }

    let mut migrated_any = false;
    for (name, value) in [
        (KEYCHAIN_KEY_NAME, credentials.encryption_key.as_deref()),
        (KEYCHAIN_SYNC_PASSWORD, credentials.sync_password.as_deref()),
        (KEYCHAIN_SYNC_PATH, credentials.sync_path.as_deref()),
    ] {
        if let Some(value) = value {
            if backend.get(KEYCHAIN_SERVICE, name)?.is_none() {
                backend.set(KEYCHAIN_SERVICE, name, value)?;
            }
            migrated_any = true;
        }
    }

    if migrated_any {
        let path = legacy_fallback_path()?;
        fs::remove_file(path).map_err(|_| CryptoError::Storage)?;
        log::info!("Migrated legacy credentials into the OS credential store");
    }
    Ok(migrated_any)
}

fn get_credential_with<B: CredentialBackend>(
    backend: &B,
    name: &str,
) -> Result<Option<Zeroizing<String>>, CryptoError> {
    if let Some(value) = backend.get(KEYCHAIN_SERVICE, name)? {
        return Ok(Some(value));
    }

    // Releases before 2.7 used a different service identifier on some platforms.
    if let Some(value) = backend.get(LEGACY_KEYCHAIN_SERVICE, name)? {
        validate_legacy_credential_value(name, &value)?;
        backend.set(KEYCHAIN_SERVICE, name, &value)?;
        backend.delete(LEGACY_KEYCHAIN_SERVICE, name)?;
        return Ok(Some(value));
    }

    // Migration is opportunistic. A failure here means we could not import old
    // credentials — never that the caller may not read or create current ones.
    match migrate_legacy_credentials(backend) {
        Ok(true) => {
            if let Some(value) = backend.get(KEYCHAIN_SERVICE, name)? {
                return Ok(Some(value));
            }
        }
        Ok(false) => {}
        Err(error) => log::warn!("Legacy credential migration failed: {error}"),
    }
    Ok(None)
}

fn get_credential(name: &str) -> Result<Option<Zeroizing<String>>, CryptoError> {
    get_credential_with(&OsCredentialBackend, name)
}

fn store_credential(name: &str, value: &str) -> Result<(), CryptoError> {
    OsCredentialBackend.set(KEYCHAIN_SERVICE, name, value)
}

fn store_credential_if_missing_with<B: CredentialBackend>(
    backend: &B,
    name: &str,
    value: &str,
) -> Result<(), CryptoError> {
    if get_credential_with(backend, name)?.is_none() {
        backend.set(KEYCHAIN_SERVICE, name, value)?;
    }
    Ok(())
}

fn has_credential(name: &str) -> Result<bool, CryptoError> {
    Ok(get_credential(name)?.is_some())
}

fn delete_credential(name: &str) -> Result<(), CryptoError> {
    for service in [KEYCHAIN_SERVICE, LEGACY_KEYCHAIN_SERVICE] {
        OsCredentialBackend.delete(service, name)?;
    }
    Ok(())
}

fn rotate_encryption_key_with<B: CredentialBackend>(
    backend: &B,
    encoded: &str,
) -> Result<(), CryptoError> {
    let _ = decode_key(encoded)?;
    // A verified overwrite avoids the recovery gap created by delete-then-create.
    backend.set(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME, encoded)?;
    // The stable entry now takes precedence. Failure to remove a stale legacy copy
    // must not make the UI retain token ciphertext encrypted by the previous key.
    if backend
        .delete(LEGACY_KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
        .is_err()
    {
        log::warn!("Unable to remove the legacy encryption-key entry after rotation");
    }
    Ok(())
}

fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut bytes = [0_u8; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| CryptoError::Encryption)?;
    Ok(bytes)
}

fn decode_key(key_base64: &str) -> Result<Zeroizing<[u8; KEY_LEN]>, CryptoError> {
    let decoded = Zeroizing::new(
        BASE64
            .decode(key_base64)
            .map_err(|_| CryptoError::InvalidFormat)?,
    );
    let key: [u8; KEY_LEN] = decoded
        .as_slice()
        .try_into()
        .map_err(|_| CryptoError::InvalidFormat)?;
    Ok(Zeroizing::new(key))
}

fn validate_legacy_credential_value(name: &str, value: &str) -> Result<(), CryptoError> {
    match name {
        KEYCHAIN_KEY_NAME => {
            let _ = decode_key(value)?;
            Ok(())
        }
        KEYCHAIN_SYNC_PASSWORD => {
            if value.is_empty() || value.len() > MAX_PASSWORD_BYTES {
                Err(CryptoError::InvalidPassword)
            } else {
                Ok(())
            }
        }
        KEYCHAIN_SYNC_PATH => validate_sync_path(value),
        _ => Err(CryptoError::InvalidFormat),
    }
}

fn seal(
    plaintext: &[u8],
    key: &[u8],
    nonce_bytes: [u8; NONCE_LEN],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| CryptoError::Encryption)?;
    let key = LessSafeKey::new(unbound);
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut output = plaintext.to_vec();
    key.seal_in_place_append_tag(nonce, Aad::from(aad), &mut output)
        .map_err(|_| CryptoError::Encryption)?;
    Ok(output)
}

fn open(
    ciphertext: &[u8],
    key: &[u8],
    nonce_bytes: [u8; NONCE_LEN],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| CryptoError::Decryption)?;
    let key = LessSafeKey::new(unbound);
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut output = Zeroizing::new(ciphertext.to_vec());
    let plaintext_len = key
        .open_in_place(nonce, Aad::from(aad), output.as_mut())
        .map_err(|_| CryptoError::Decryption)?
        .len();
    output.truncate(plaintext_len);
    Ok(output)
}

fn derive_argon2id_key(
    password: &[u8],
    salt: &[u8],
) -> Result<Zeroizing<[u8; KEY_LEN]>, CryptoError> {
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
        Some(KEY_LEN),
    )
    .map_err(|_| CryptoError::Encryption)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0_u8; KEY_LEN]);
    argon2
        .hash_password_into(password, salt, key.as_mut())
        .map_err(|_| CryptoError::Encryption)?;
    Ok(key)
}

fn encrypt_password_v2(
    plaintext: &[u8],
    password: &[u8],
    salt: [u8; SALT_LEN],
    nonce: [u8; NONCE_LEN],
) -> Result<String, CryptoError> {
    let key = derive_argon2id_key(password, &salt)?;
    let ciphertext = seal(plaintext, key.as_ref(), nonce, PASSWORD_AAD)?;
    let mut combined =
        Vec::with_capacity(PASSWORD_FORMAT_MAGIC.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(PASSWORD_FORMAT_MAGIC);
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

fn decrypt_password_v2(combined: &[u8], password: &[u8]) -> Result<String, CryptoError> {
    let minimum = PASSWORD_FORMAT_MAGIC.len() + SALT_LEN + NONCE_LEN + TAG_LEN;
    if combined.len() < minimum || !combined.starts_with(PASSWORD_FORMAT_MAGIC) {
        return Err(CryptoError::InvalidFormat);
    }
    let salt_start = PASSWORD_FORMAT_MAGIC.len();
    let nonce_start = salt_start + SALT_LEN;
    let ciphertext_start = nonce_start + NONCE_LEN;
    let salt = &combined[salt_start..nonce_start];
    let nonce: [u8; NONCE_LEN] = combined[nonce_start..ciphertext_start]
        .try_into()
        .map_err(|_| CryptoError::InvalidFormat)?;
    let key = derive_argon2id_key(password, salt).map_err(|_| CryptoError::Decryption)?;
    let plaintext = open(
        &combined[ciphertext_start..],
        key.as_ref(),
        nonce,
        PASSWORD_AAD,
    )?;
    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption)
}

fn decrypt_password_legacy(combined: &[u8], password: &[u8]) -> Result<String, CryptoError> {
    if combined.len() < SALT_LEN + NONCE_LEN + TAG_LEN {
        return Err(CryptoError::InvalidFormat);
    }
    let salt = &combined[..SALT_LEN];
    let nonce: [u8; NONCE_LEN] = combined[SALT_LEN..SALT_LEN + NONCE_LEN]
        .try_into()
        .map_err(|_| CryptoError::InvalidFormat)?;
    let key = Zeroizing::new(derive_legacy_key(password, salt, LEGACY_PBKDF2_ITERATIONS));
    let plaintext = open(&combined[SALT_LEN + NONCE_LEN..], key.as_ref(), nonce, &[])?;
    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption)
}

fn encrypt_local(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    if plaintext.len() > MAX_SECRET_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    let nonce = random_bytes::<NONCE_LEN>()?;
    let ciphertext = seal(plaintext.as_bytes(), key, nonce, LOCAL_AAD)?;
    let mut combined = Vec::with_capacity(LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(LOCAL_FORMAT_MAGIC);
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

fn decrypt_local(ciphertext_base64: &str, key: &[u8]) -> Result<String, CryptoError> {
    if ciphertext_base64.len() > MAX_CIPHERTEXT_BASE64_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    let combined = BASE64
        .decode(ciphertext_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;
    if combined.starts_with(LOCAL_FORMAT_MAGIC) {
        let minimum = LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + TAG_LEN;
        if combined.len() < minimum {
            return Err(CryptoError::InvalidFormat);
        }
        let nonce_start = LOCAL_FORMAT_MAGIC.len();
        let ciphertext_start = nonce_start + NONCE_LEN;
        let nonce = combined[nonce_start..ciphertext_start]
            .try_into()
            .map_err(|_| CryptoError::InvalidFormat)?;
        let modern =
            open(&combined[ciphertext_start..], key, nonce, LOCAL_AAD).and_then(|plaintext| {
                String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption)
            });
        if modern.is_ok() {
            return modern;
        }
        // A legacy random nonce can begin with YHL2 by coincidence. Its AEAD tag
        // still authenticates under the legacy layout, so fallback is fail-closed.
        return decrypt_local_legacy_decoded(&combined, key).or(modern);
    }
    decrypt_local_legacy_decoded(&combined, key)
}

fn decrypt_local_legacy(ciphertext_base64: &str, key: &[u8]) -> Result<String, CryptoError> {
    let combined = BASE64
        .decode(ciphertext_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;
    decrypt_local_legacy_decoded(&combined, key)
}

fn decrypt_local_legacy_decoded(combined: &[u8], key: &[u8]) -> Result<String, CryptoError> {
    if combined.len() < NONCE_LEN + TAG_LEN {
        return Err(CryptoError::InvalidFormat);
    }
    let nonce = combined[..NONCE_LEN]
        .try_into()
        .map_err(|_| CryptoError::InvalidFormat)?;
    let plaintext = open(&combined[NONCE_LEN..], key, nonce, &[])?;
    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption)
}

#[cfg(feature = "fuzzing")]
pub(crate) fn fuzz_local_ciphertext(data: &[u8]) {
    if data.len() <= MAX_SECRET_BYTES + LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + TAG_LEN {
        let _ = decrypt_local(&BASE64.encode(data), &[0x42; KEY_LEN]);
    }
}

fn has_encryption_key_blocking() -> Result<bool, CryptoError> {
    has_credential(KEYCHAIN_KEY_NAME)
}

fn get_encryption_key() -> Result<Zeroizing<String>, CryptoError> {
    get_credential(KEYCHAIN_KEY_NAME)?.ok_or(CryptoError::MissingEncryptionKey)
}

fn ensure_encryption_key_blocking() -> Result<bool, CryptoError> {
    if has_credential(KEYCHAIN_KEY_NAME)? {
        return Ok(false);
    }

    // has_credential already tried to migrate. Reaching here with a legacy file
    // that still yields a key means that migration failed to write — minting a
    // fresh key now would orphan the real one and make every existing token
    // permanently unreadable. Fail loudly so the next attempt can migrate.
    if legacy_fallback_holds_encryption_key() {
        log::error!(
            "Refusing to create an encryption key while an unmigrated legacy key is present"
        );
        return Err(CryptoError::Keychain);
    }

    let key = Zeroizing::new(random_bytes::<KEY_LEN>()?);
    let encoded = Zeroizing::new(BASE64.encode(key.as_ref()));
    store_credential(KEYCHAIN_KEY_NAME, &encoded)?;
    Ok(true)
}

fn legacy_fallback_holds_encryption_key() -> bool {
    read_legacy_fallback_credentials()
        .is_some_and(|credentials| credentials.encryption_key.is_some())
}

fn reset_encryption_key_blocking() -> Result<(), CryptoError> {
    let key = Zeroizing::new(random_bytes::<KEY_LEN>()?);
    let encoded = Zeroizing::new(BASE64.encode(key.as_ref()));
    rotate_encryption_key_with(&OsCredentialBackend, &encoded)
}

fn encrypt_with_keychain_key_blocking(plaintext: String) -> Result<String, CryptoError> {
    let encoded = get_encryption_key()?;
    let key = decode_key(&encoded)?;
    let plaintext = Zeroizing::new(plaintext);
    encrypt_local(&plaintext, key.as_ref())
}

fn decrypt_with_keychain_key_blocking(ciphertext_base64: String) -> Result<String, CryptoError> {
    let encoded = get_encryption_key()?;
    let key = decode_key(&encoded)?;
    decrypt_local(&ciphertext_base64, key.as_ref())
}

fn encrypt_with_password_bytes(plaintext: &[u8], password: &[u8]) -> Result<String, CryptoError> {
    if plaintext.len() > MAX_BACKUP_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    if !(8..=MAX_PASSWORD_BYTES).contains(&password.len()) {
        return Err(CryptoError::InvalidPassword);
    }
    encrypt_password_v2(
        plaintext,
        password,
        random_bytes::<SALT_LEN>()?,
        random_bytes::<NONCE_LEN>()?,
    )
}

fn decrypt_with_password_bytes(
    ciphertext_base64: &str,
    password: &[u8],
) -> Result<String, CryptoError> {
    if ciphertext_base64.len() > MAX_CIPHERTEXT_BASE64_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    if password.is_empty() || password.len() > MAX_PASSWORD_BYTES {
        return Err(CryptoError::InvalidPassword);
    }
    let combined = BASE64
        .decode(ciphertext_base64)
        .map_err(|_| CryptoError::InvalidFormat)?;
    if combined.starts_with(PASSWORD_FORMAT_MAGIC) {
        let modern = decrypt_password_v2(&combined, password);
        if modern.is_ok() {
            modern
        } else {
            // A legacy random salt can begin with YHP2 by coincidence. Only a
            // valid legacy AES-GCM tag can make this compatibility path succeed.
            decrypt_password_legacy(&combined, password).or(modern)
        }
    } else {
        decrypt_password_legacy(&combined, password)
    }
}

fn encrypt_with_password_blocking(
    plaintext: String,
    password: String,
) -> Result<String, CryptoError> {
    let plaintext = Zeroizing::new(plaintext);
    let password = Zeroizing::new(password);
    encrypt_with_password_bytes(plaintext.as_bytes(), password.as_bytes())
}

fn decrypt_with_password_blocking(
    ciphertext_base64: String,
    password: String,
) -> Result<String, CryptoError> {
    let password = Zeroizing::new(password);
    decrypt_with_password_bytes(&ciphertext_base64, password.as_bytes())
}

fn get_sync_password() -> Result<Zeroizing<String>, CryptoError> {
    get_credential(KEYCHAIN_SYNC_PASSWORD)?.ok_or(CryptoError::Keychain)
}

fn encrypt_with_sync_password_blocking(plaintext: String) -> Result<String, CryptoError> {
    let plaintext = Zeroizing::new(plaintext);
    let password = get_sync_password()?;
    encrypt_with_password_bytes(plaintext.as_bytes(), password.as_bytes())
}

fn decrypt_with_sync_password_blocking(ciphertext_base64: String) -> Result<String, CryptoError> {
    let password = get_sync_password()?;
    decrypt_with_password_bytes(&ciphertext_base64, password.as_bytes())
}

fn store_sync_password_blocking(password: String) -> Result<(), CryptoError> {
    let password = Zeroizing::new(password);
    if !(8..=MAX_PASSWORD_BYTES).contains(&password.len()) {
        return Err(CryptoError::InvalidPassword);
    }
    store_credential(KEYCHAIN_SYNC_PASSWORD, &password)
}

fn migrate_legacy_frontend_credentials_blocking(
    encryption_key: Option<String>,
    sync_password: Option<String>,
    sync_path: Option<String>,
) -> Result<(), CryptoError> {
    let encryption_key = encryption_key.map(Zeroizing::new);
    let sync_password = sync_password.map(Zeroizing::new);

    // Validate the complete legacy payload before writing any part of it.
    if let Some(key) = encryption_key.as_deref() {
        let _ = decode_key(key)?;
    }
    if let Some(password) = sync_password.as_deref()
        && (password.is_empty() || password.len() > MAX_PASSWORD_BYTES)
    {
        return Err(CryptoError::InvalidPassword);
    }
    if let Some(path) = sync_path.as_deref() {
        validate_sync_path(path)?;
    }

    // Current OS-store values always take precedence over stale localStorage data.
    for (name, value) in [
        (
            KEYCHAIN_KEY_NAME,
            encryption_key.as_ref().map(|value| value.as_str()),
        ),
        (
            KEYCHAIN_SYNC_PASSWORD,
            sync_password.as_ref().map(|value| value.as_str()),
        ),
        (KEYCHAIN_SYNC_PATH, sync_path.as_deref()),
    ] {
        if let Some(value) = value {
            store_credential_if_missing_with(&OsCredentialBackend, name, value)?;
        }
    }
    Ok(())
}

fn has_sync_password_blocking() -> Result<bool, CryptoError> {
    has_credential(KEYCHAIN_SYNC_PASSWORD)
}

fn delete_sync_password_blocking() -> Result<(), CryptoError> {
    delete_credential(KEYCHAIN_SYNC_PASSWORD)
}

fn validate_sync_path(path: &str) -> Result<(), CryptoError> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') || !Path::new(path).is_absolute()
    {
        return Err(CryptoError::InvalidFormat);
    }
    Ok(())
}

pub(crate) fn get_sync_directory() -> Result<PathBuf, CryptoError> {
    let path = get_credential(KEYCHAIN_SYNC_PATH)?
        .map(|value| PathBuf::from(value.as_str()))
        .ok_or(CryptoError::Keychain)?;
    validate_sync_path(path.to_str().ok_or(CryptoError::InvalidFormat)?)?;
    Ok(path)
}

fn store_sync_path_blocking(path: String) -> Result<(), CryptoError> {
    validate_sync_path(&path)?;
    store_credential(KEYCHAIN_SYNC_PATH, &path)
}

fn get_sync_path_blocking() -> Result<String, CryptoError> {
    get_credential(KEYCHAIN_SYNC_PATH)?
        .map(|value| value.to_string())
        .ok_or(CryptoError::Keychain)
}

fn has_sync_path_blocking() -> Result<bool, CryptoError> {
    has_credential(KEYCHAIN_SYNC_PATH)
}

fn delete_sync_path_blocking() -> Result<(), CryptoError> {
    delete_credential(KEYCHAIN_SYNC_PATH)
}

/// Tauri runs synchronous commands on the main thread. Everything below touches
/// the OS credential store or runs a deliberately expensive KDF (Argon2id at
/// 64 MiB, PBKDF2 at 600k rounds), so running it there froze the UI for the
/// duration of every crypto call. Offload it like files.rs already does.
async fn offload<T, F>(work: F) -> Result<T, CryptoError>
where
    F: FnOnce() -> Result<T, CryptoError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| {
            // A join failure means the worker panicked or was cancelled — not that
            // the credential store failed, which is what Storage would imply.
            log::error!("A crypto worker task failed to complete: {error}");
            CryptoError::Internal
        })?
}

#[tauri::command]
pub async fn has_encryption_key() -> Result<bool, CryptoError> {
    offload(has_encryption_key_blocking).await
}

#[tauri::command]
pub async fn ensure_encryption_key() -> Result<bool, CryptoError> {
    offload(ensure_encryption_key_blocking).await
}

#[tauri::command]
pub async fn reset_encryption_key() -> Result<(), CryptoError> {
    offload(reset_encryption_key_blocking).await
}

#[tauri::command]
pub async fn encrypt_with_keychain_key(plaintext: String) -> Result<String, CryptoError> {
    offload(move || encrypt_with_keychain_key_blocking(plaintext)).await
}

#[tauri::command]
pub async fn decrypt_with_keychain_key(ciphertext_base64: String) -> Result<String, CryptoError> {
    offload(move || decrypt_with_keychain_key_blocking(ciphertext_base64)).await
}

#[tauri::command]
pub async fn encrypt_with_password(
    plaintext: String,
    password: String,
) -> Result<String, CryptoError> {
    offload(move || encrypt_with_password_blocking(plaintext, password)).await
}

#[tauri::command]
pub async fn decrypt_with_password(
    ciphertext_base64: String,
    password: String,
) -> Result<String, CryptoError> {
    offload(move || decrypt_with_password_blocking(ciphertext_base64, password)).await
}

#[tauri::command]
pub async fn encrypt_with_sync_password(plaintext: String) -> Result<String, CryptoError> {
    offload(move || encrypt_with_sync_password_blocking(plaintext)).await
}

#[tauri::command]
pub async fn decrypt_with_sync_password(ciphertext_base64: String) -> Result<String, CryptoError> {
    offload(move || decrypt_with_sync_password_blocking(ciphertext_base64)).await
}

#[tauri::command]
pub async fn store_sync_password(password: String) -> Result<(), CryptoError> {
    offload(move || store_sync_password_blocking(password)).await
}

#[tauri::command]
pub async fn migrate_legacy_frontend_credentials(
    encryption_key: Option<String>,
    sync_password: Option<String>,
    sync_path: Option<String>,
) -> Result<(), CryptoError> {
    offload(move || {
        migrate_legacy_frontend_credentials_blocking(encryption_key, sync_password, sync_path)
    })
    .await
}

#[tauri::command]
pub async fn has_sync_password() -> Result<bool, CryptoError> {
    offload(has_sync_password_blocking).await
}

#[tauri::command]
pub async fn delete_sync_password() -> Result<(), CryptoError> {
    offload(delete_sync_password_blocking).await
}

#[tauri::command]
pub async fn store_sync_path(path: String) -> Result<(), CryptoError> {
    offload(move || store_sync_path_blocking(path)).await
}

#[tauri::command]
pub async fn get_sync_path() -> Result<String, CryptoError> {
    offload(get_sync_path_blocking).await
}

#[tauri::command]
pub async fn has_sync_path() -> Result<bool, CryptoError> {
    offload(has_sync_path_blocking).await
}

#[tauri::command]
pub async fn delete_sync_path() -> Result<(), CryptoError> {
    offload(delete_sync_path_blocking).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::HashMap};

    const TEST_KEY: [u8; KEY_LEN] = [0x42; KEY_LEN];
    const TEST_NONCE: [u8; NONCE_LEN] = [0x24; NONCE_LEN];
    const TEST_SALT: [u8; SALT_LEN] = [0x11; SALT_LEN];

    #[derive(Default)]
    struct MemoryCredentialBackend {
        values: RefCell<HashMap<(String, String), String>>,
        unavailable: bool,
    }

    impl CredentialBackend for MemoryCredentialBackend {
        fn get(&self, service: &str, name: &str) -> Result<Option<Zeroizing<String>>, CryptoError> {
            if self.unavailable {
                return Err(CryptoError::Keychain);
            }
            Ok(self
                .values
                .borrow()
                .get(&(service.to_owned(), name.to_owned()))
                .cloned()
                .map(Zeroizing::new))
        }

        fn set(&self, service: &str, name: &str, value: &str) -> Result<(), CryptoError> {
            if self.unavailable {
                return Err(CryptoError::Keychain);
            }
            self.values
                .borrow_mut()
                .insert((service.to_owned(), name.to_owned()), value.to_owned());
            Ok(())
        }

        fn delete(&self, service: &str, name: &str) -> Result<(), CryptoError> {
            if self.unavailable {
                return Err(CryptoError::Keychain);
            }
            self.values
                .borrow_mut()
                .remove(&(service.to_owned(), name.to_owned()));
            Ok(())
        }
    }

    #[test]
    fn credential_backend_failures_fail_closed() {
        let backend = MemoryCredentialBackend {
            unavailable: true,
            ..Default::default()
        };
        assert!(matches!(
            get_credential_with(&backend, KEYCHAIN_KEY_NAME),
            Err(CryptoError::Keychain)
        ));
    }

    #[test]
    fn an_undecryptable_legacy_credential_file_is_ignored() {
        // Keyed by username+hostname, so renaming the machine makes this file
        // permanently undecryptable. It must decode as "nothing to migrate" —
        // propagating the failure previously blocked every credential lookup,
        // which left the app unable to create an encryption key at all.
        // Deliberately does not touch the real file: it holds live credentials.
        assert!(decode_legacy_fallback_credentials("not-a-valid-ciphertext").is_none());
        assert!(decode_legacy_fallback_credentials("").is_none());
        assert!(decode_legacy_fallback_credentials(&"x".repeat(1024)).is_none());
    }

    #[test]
    fn an_unusable_legacy_file_still_allows_credential_lookups() {
        // Whatever the legacy file is doing, a lookup must report "no credential"
        // rather than an error, so ensure_encryption_key can go on to create one.
        let backend = MemoryCredentialBackend::default();
        assert!(matches!(
            get_credential_with(&backend, KEYCHAIN_KEY_NAME),
            Ok(None)
        ));
    }

    #[test]
    fn legacy_keychain_entry_is_moved_to_the_stable_service() {
        let backend = MemoryCredentialBackend::default();
        let legacy_value = BASE64.encode([0x33_u8; KEY_LEN]);
        backend
            .set(LEGACY_KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME, &legacy_value)
            .expect("mock write succeeds");
        assert_eq!(
            get_credential_with(&backend, KEYCHAIN_KEY_NAME)
                .expect("migration succeeds")
                .expect("credential exists")
                .as_str(),
            legacy_value
        );
        assert!(
            backend
                .get(LEGACY_KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
                .expect("mock read succeeds")
                .is_none()
        );
        assert!(
            backend
                .get(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
                .expect("mock read succeeds")
                .is_some()
        );
    }

    #[test]
    fn legacy_frontend_migration_never_overwrites_a_current_key() {
        let backend = MemoryCredentialBackend::default();
        backend
            .set(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME, "current-value")
            .expect("current key write succeeds");
        store_credential_if_missing_with(&backend, KEYCHAIN_KEY_NAME, "stale-value")
            .expect("migration succeeds");
        assert_eq!(
            backend
                .get(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
                .expect("current key read succeeds")
                .expect("current key exists")
                .as_str(),
            "current-value"
        );
    }

    #[test]
    fn encryption_key_rotation_overwrites_before_legacy_cleanup() {
        let backend = MemoryCredentialBackend::default();
        let old_key = BASE64.encode([0x11_u8; KEY_LEN]);
        let new_key = BASE64.encode([0x22_u8; KEY_LEN]);
        backend
            .set(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME, &old_key)
            .expect("current key write succeeds");
        backend
            .set(LEGACY_KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME, &old_key)
            .expect("legacy key write succeeds");

        rotate_encryption_key_with(&backend, &new_key).expect("rotation succeeds");

        assert_eq!(
            backend
                .get(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
                .expect("current key read succeeds")
                .expect("current key exists")
                .as_str(),
            new_key
        );
        assert!(
            backend
                .get(LEGACY_KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME)
                .expect("legacy key read succeeds")
                .is_none()
        );
    }

    #[test]
    fn pbkdf2_sha256_matches_known_vector() {
        let key = derive_legacy_key(b"password", b"salt", 1);
        assert_eq!(
            BASE64.encode(key),
            "Eg+2z/z4syxD5yJSVsT4N6hlSMkszDVICAWYfLcL4Xs="
        );
    }

    #[test]
    fn password_v2_round_trip_is_deterministic_with_fixed_randomness() {
        let encrypted =
            encrypt_password_v2(b"example backup", b"correct horse", TEST_SALT, TEST_NONCE)
                .expect("encryption succeeds");
        let decoded = BASE64.decode(&encrypted).expect("base64 is valid");
        assert!(decoded.starts_with(PASSWORD_FORMAT_MAGIC));
        assert_eq!(
            decrypt_password_v2(&decoded, b"correct horse").expect("decryption succeeds"),
            "example backup"
        );
    }

    #[test]
    fn password_v2_rejects_wrong_password_and_tampering() {
        let encrypted =
            encrypt_password_v2(b"example backup", b"correct horse", TEST_SALT, TEST_NONCE)
                .expect("encryption succeeds");
        let mut decoded = BASE64.decode(encrypted).expect("base64 is valid");
        assert!(decrypt_password_v2(&decoded, b"wrong password").is_err());
        let last = decoded.len() - 1;
        decoded[last] ^= 1;
        assert!(decrypt_password_v2(&decoded, b"correct horse").is_err());
    }

    #[test]
    fn password_v2_rejects_truncated_or_modified_headers() {
        let encrypted =
            encrypt_password_v2(b"example backup", b"correct horse", TEST_SALT, TEST_NONCE)
                .expect("encryption succeeds");
        let mut decoded = BASE64.decode(encrypted).expect("base64 is valid");
        assert!(decrypt_password_v2(&decoded[..20], b"correct horse").is_err());
        decoded[0] ^= 1;
        assert!(decrypt_password_v2(&decoded, b"correct horse").is_err());
    }

    #[test]
    fn legacy_password_backup_remains_readable() {
        let key = derive_legacy_key(b"legacy password", &TEST_SALT, LEGACY_PBKDF2_ITERATIONS);
        let ciphertext =
            seal(b"legacy backup", &key, TEST_NONCE, &[]).expect("legacy encryption succeeds");
        let mut legacy = TEST_SALT.to_vec();
        legacy.extend_from_slice(&TEST_NONCE);
        legacy.extend_from_slice(&ciphertext);
        assert_eq!(
            decrypt_password_legacy(&legacy, b"legacy password")
                .expect("legacy decryption succeeds"),
            "legacy backup"
        );
    }

    #[test]
    fn legacy_password_marker_collision_remains_readable() {
        let password = b"correct horse";
        let mut salt = TEST_SALT;
        salt[..PASSWORD_FORMAT_MAGIC.len()].copy_from_slice(PASSWORD_FORMAT_MAGIC);
        let key = Zeroizing::new(derive_legacy_key(password, &salt, LEGACY_PBKDF2_ITERATIONS));
        let ciphertext =
            seal(b"legacy collision", key.as_ref(), TEST_NONCE, &[]).expect("encryption succeeds");
        let mut combined = Vec::new();
        combined.extend_from_slice(&salt);
        combined.extend_from_slice(&TEST_NONCE);
        combined.extend_from_slice(&ciphertext);

        assert_eq!(
            decrypt_with_password_bytes(&BASE64.encode(combined), password)
                .expect("collision decrypts"),
            "legacy collision"
        );
    }

    #[test]
    fn local_v2_and_legacy_formats_both_decrypt() {
        let modern_ciphertext = seal(b"JBSWY3DPEHPK3PXP", &TEST_KEY, TEST_NONCE, LOCAL_AAD)
            .expect("encryption succeeds");
        let mut modern = LOCAL_FORMAT_MAGIC.to_vec();
        modern.extend_from_slice(&TEST_NONCE);
        modern.extend_from_slice(&modern_ciphertext);
        assert_eq!(
            decrypt_local(&BASE64.encode(modern), &TEST_KEY).expect("modern decrypt succeeds"),
            "JBSWY3DPEHPK3PXP"
        );

        let legacy_ciphertext =
            seal(b"JBSWY3DPEHPK3PXP", &TEST_KEY, TEST_NONCE, &[]).expect("encryption succeeds");
        let mut legacy = TEST_NONCE.to_vec();
        legacy.extend_from_slice(&legacy_ciphertext);
        assert_eq!(
            decrypt_local(&BASE64.encode(legacy), &TEST_KEY).expect("legacy decrypt succeeds"),
            "JBSWY3DPEHPK3PXP"
        );
    }

    #[test]
    fn legacy_local_marker_collision_remains_readable() {
        let mut nonce = TEST_NONCE;
        nonce[..LOCAL_FORMAT_MAGIC.len()].copy_from_slice(LOCAL_FORMAT_MAGIC);
        let ciphertext =
            seal(b"JBSWY3DPEHPK3PXP", &TEST_KEY, nonce, &[]).expect("encryption succeeds");
        let mut combined = Vec::new();
        combined.extend_from_slice(&nonce);
        combined.extend_from_slice(&ciphertext);

        assert_eq!(
            decrypt_local(&BASE64.encode(combined), &TEST_KEY).expect("collision decrypts"),
            "JBSWY3DPEHPK3PXP"
        );
    }

    #[test]
    fn local_encryption_uses_a_fresh_nonce() {
        let first = encrypt_local("JBSWY3DPEHPK3PXP", &TEST_KEY).expect("encryption succeeds");
        let second = encrypt_local("JBSWY3DPEHPK3PXP", &TEST_KEY).expect("encryption succeeds");
        assert_ne!(first, second);
        assert_eq!(
            decrypt_local(&first, &TEST_KEY).expect("decryption succeeds"),
            "JBSWY3DPEHPK3PXP"
        );
    }

    #[test]
    fn key_and_path_validation_fail_closed() {
        assert!(decode_key("not base64").is_err());
        assert!(decode_key(&BASE64.encode([0_u8; 31])).is_err());
        assert!(validate_sync_path("../relative").is_err());
        assert!(validate_sync_path("/absolute/path").is_ok());
    }
}
