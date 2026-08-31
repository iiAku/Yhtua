use thiserror::Error;

/// Errors produced by the pure format and KDF operations.
///
/// Platform adapters wrap this in their own error type (adding keychain and
/// storage variants). The `Display` strings are part of the desktop IPC
/// contract — the frontend surfaces them verbatim — so they must not change.
#[derive(Error, Debug)]
pub enum CryptoError {
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
}
