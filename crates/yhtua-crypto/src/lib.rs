//! Platform-neutral implementations of Yhtua's encrypted formats.
//!
//! This crate holds the byte-exact format and KDF logic shared by every Yhtua
//! client: the `YHL2` local-secret format, the `YHP2` portable-backup format,
//! and read-only support for their pre-2.8 predecessors. It must never depend
//! on a keychain, filesystem paths, logging, or any UI/runtime framework — key
//! custody, credential storage, and IPC belong to the platform adapters
//! (`src-tauri` on desktop, the native mobile bridge on iOS).
//!
//! The golden vectors in `test/fixtures/crypto-vectors.json` (repository root)
//! are the compatibility contract: a change that breaks them is a format break,
//! never a test to update.

mod envelope;
mod error;
mod kdf;
mod keys;

#[cfg(feature = "fuzzing")]
pub use envelope::fuzz_local_ciphertext;
pub use envelope::{
    MAX_CIPHERTEXT_BASE64_BYTES, MAX_PASSWORD_BYTES, decrypt_local, decrypt_local_legacy,
    decrypt_with_password_bytes, encrypt_local, encrypt_with_password_bytes,
};
pub use error::CryptoError;
pub use kdf::{LEGACY_PBKDF2_ITERATIONS, derive_legacy_key};
pub use keys::{KEY_LEN, decode_key, random_bytes};
