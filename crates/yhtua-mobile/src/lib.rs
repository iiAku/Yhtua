//! UniFFI bridge over `yhtua-crypto` for the mobile native module.
//!
//! Stateless, bytes-in/bytes-out operations only: the Swift layer owns key
//! custody END TO END — it GENERATES the key (SecRandomCopyBytes), stores it
//! behind Keychain access control, and passes it per call; key material never
//! crosses this FFI as a RETURN value, because UniFFI's return staging
//! buffers are not zeroized. Inbound arguments are wrapped in `Zeroizing`
//! on the Rust side; the transient UniFFI lift copy is an accepted residual
//! within the same process memory that also holds decrypted codes (see the
//! threat model). `getRawKey` does not exist at any layer above this one —
//! the Swift module exposes narrow operations to JS and never the key.
//! Binary envelope parsing (YHL2/YHP2/legacy) lives ONLY in `yhtua-crypto`;
//! this crate adds nothing but the FFI surface.

use zeroize::Zeroizing;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum VaultError {
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

impl From<yhtua_crypto::CryptoError> for VaultError {
    fn from(error: yhtua_crypto::CryptoError) -> Self {
        match error {
            yhtua_crypto::CryptoError::Encryption => Self::Encryption,
            yhtua_crypto::CryptoError::Decryption => Self::Decryption,
            yhtua_crypto::CryptoError::InvalidFormat => Self::InvalidFormat,
            yhtua_crypto::CryptoError::InputTooLarge => Self::InputTooLarge,
            yhtua_crypto::CryptoError::InvalidPassword => Self::InvalidPassword,
        }
    }
}

/// Encrypts one secret to the `YHL2` local format.
#[uniffi::export]
pub fn encrypt_local(key: Vec<u8>, plaintext: String) -> Result<String, VaultError> {
    let key = Zeroizing::new(key);
    let plaintext = Zeroizing::new(plaintext);
    Ok(yhtua_crypto::encrypt_local(&plaintext, key.as_ref())?)
}

/// Decrypts a `YHL2` (or read-only legacy) local ciphertext.
#[uniffi::export]
pub fn decrypt_local(key: Vec<u8>, ciphertext_base64: String) -> Result<String, VaultError> {
    let key = Zeroizing::new(key);
    Ok(yhtua_crypto::decrypt_local(
        &ciphertext_base64,
        key.as_ref(),
    )?)
}

/// Encrypts a portable backup payload to the `YHP2` format.
#[uniffi::export]
pub fn export_yhp2(password: String, payload: String) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    let payload = Zeroizing::new(payload);
    Ok(yhtua_crypto::encrypt_with_password_bytes(
        payload.as_bytes(),
        password.as_bytes(),
    )?)
}

/// Decrypts a `YHP2` (or read-only legacy PBKDF2) portable backup.
#[uniffi::export]
pub fn import_yhp2(password: String, envelope_base64: String) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    Ok(yhtua_crypto::decrypt_with_password_bytes(
        &envelope_base64,
        password.as_bytes(),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

    #[derive(serde::Deserialize)]
    struct Fixture {
        key_base64: String,
        password: String,
        vectors: Vec<Vector>,
        rejection_vectors: Vec<Rejection>,
    }

    #[derive(serde::Deserialize)]
    struct Vector {
        format: String,
        plaintext: String,
        ciphertext_base64: String,
    }

    #[derive(serde::Deserialize)]
    struct Rejection {
        format: String,
        ciphertext_base64: String,
        expected: String,
    }

    #[test]
    fn error_variants_and_boundaries_through_the_ffi_surface() {
        let key = vec![0x42_u8; 32];
        // Exact plaintext boundary: 4096 encrypts, 4097 is too large.
        assert!(encrypt_local(key.clone(), "A".repeat(4096)).is_ok());
        assert!(matches!(
            encrypt_local(key.clone(), "A".repeat(4097)),
            Err(VaultError::InputTooLarge)
        ));
        // A wrong-length key fails as Encryption/Decryption, never a panic.
        assert!(matches!(
            encrypt_local(vec![0_u8; 16], "JBSWY3DPEHPK3PXP".into()),
            Err(VaultError::Encryption)
        ));
        assert!(matches!(
            decrypt_local(vec![0_u8; 16], "WUhMMiQk".into()),
            Err(VaultError::InvalidFormat) | Err(VaultError::Decryption)
        ));
        // Exact password boundary: 8 bytes works, 7 is invalid.
        assert!(export_yhp2("12345678".into(), "payload".into()).is_ok());
        assert!(matches!(
            export_yhp2("1234567".into(), "payload".into()),
            Err(VaultError::InvalidPassword)
        ));
        assert!(matches!(
            import_yhp2(String::new(), "WUhQMg==".into()),
            Err(VaultError::InvalidPassword)
        ));
    }

    fn fixture() -> Fixture {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../test/fixtures/crypto-vectors.json"
        ))
        .expect("fixture file exists");
        serde_json::from_str::<serde_json::Value>(&raw)
            .map(|value| serde_json::from_value(value).expect("fixture fields present"))
            .expect("fixture is valid JSON")
    }

    /// Every golden vector must decrypt byte-exactly THROUGH the UniFFI
    /// export signatures — the same call shape the Swift layer uses.
    #[test]
    fn golden_vectors_decrypt_through_the_ffi_surface() {
        let fixture = fixture();
        assert!(
            fixture.vectors.len() >= 4,
            "fixture must carry all format vectors"
        );
        let key = BASE64.decode(&fixture.key_base64).expect("key decodes");
        for vector in &fixture.vectors {
            match vector.format.as_str() {
                "YHL2" | "legacy-local" => {
                    assert_eq!(
                        decrypt_local(key.clone(), vector.ciphertext_base64.clone())
                            .expect("local vector decrypts"),
                        vector.plaintext
                    );
                }
                "YHP2" | "legacy-password" => {
                    assert_eq!(
                        import_yhp2(fixture.password.clone(), vector.ciphertext_base64.clone())
                            .expect("password vector decrypts"),
                        vector.plaintext
                    );
                }
                other => panic!("unknown vector format: {other}"),
            }
        }
    }

    #[test]
    fn rejection_vectors_fail_through_the_ffi_surface() {
        let fixture = fixture();
        assert!(
            fixture.rejection_vectors.len() >= 8,
            "fixture must carry rejection vectors"
        );
        let key = BASE64.decode(&fixture.key_base64).expect("key decodes");
        for vector in &fixture.rejection_vectors {
            let result = match vector.format.as_str() {
                "YHL2" | "legacy-local" => {
                    decrypt_local(key.clone(), vector.ciphertext_base64.clone())
                }
                "YHP2" | "legacy-password" => {
                    import_yhp2(fixture.password.clone(), vector.ciphertext_base64.clone())
                }
                other => panic!("unknown rejection format: {other}"),
            };
            match vector.expected.as_str() {
                "invalid-format" => {
                    assert!(matches!(result, Err(VaultError::InvalidFormat)))
                }
                "auth-failure" => assert!(matches!(result, Err(VaultError::Decryption))),
                other => panic!("unknown expected outcome: {other}"),
            }
        }
    }

    #[test]
    fn round_trips_through_the_ffi_surface() {
        let key = yhtua_crypto::random_bytes::<32>()
            .expect("key generates")
            .to_vec();
        let ciphertext = encrypt_local(key.clone(), "JBSWY3DPEHPK3PXP".into()).expect("encrypts");
        assert_eq!(
            decrypt_local(key, ciphertext).expect("decrypts"),
            "JBSWY3DPEHPK3PXP"
        );

        let envelope =
            export_yhp2("correct horse".into(), "example backup".into()).expect("exports");
        assert_eq!(
            import_yhp2("correct horse".into(), envelope).expect("imports"),
            "example backup"
        );
    }
}
