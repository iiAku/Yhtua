use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use zeroize::Zeroizing;

use crate::error::CryptoError;
use crate::kdf::{LEGACY_PBKDF2_ITERATIONS, derive_argon2id_key, derive_legacy_key};
use crate::keys::random_bytes;

const SALT_LEN: usize = 16;
const TAG_LEN: usize = 16;
const PASSWORD_FORMAT_MAGIC: &[u8; 4] = b"YHP2";
const LOCAL_FORMAT_MAGIC: &[u8; 4] = b"YHL2";
const PASSWORD_AAD: &[u8] = b"yhtua-password-backup-v2";
const LOCAL_AAD: &[u8] = b"yhtua-local-secret-v2";
const MAX_SECRET_BYTES: usize = 4 * 1024;
const MAX_BACKUP_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_CIPHERTEXT_BASE64_BYTES: usize = 24 * 1024 * 1024;
pub const MAX_PASSWORD_BYTES: usize = 1024;

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
    let key = derive_legacy_key(password, salt, LEGACY_PBKDF2_ITERATIONS);
    let plaintext = open(&combined[SALT_LEN + NONCE_LEN..], key.as_ref(), nonce, &[])?;
    String::from_utf8(plaintext.to_vec()).map_err(|_| CryptoError::Decryption)
}

pub fn encrypt_local(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    if plaintext.len() > MAX_SECRET_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    let nonce = random_bytes::<NONCE_LEN>()?;
    encrypt_local_with_nonce(plaintext, key, nonce)
}

fn encrypt_local_with_nonce(
    plaintext: &str,
    key: &[u8],
    nonce: [u8; NONCE_LEN],
) -> Result<String, CryptoError> {
    if plaintext.len() > MAX_SECRET_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
    let ciphertext = seal(plaintext.as_bytes(), key, nonce, LOCAL_AAD)?;
    let mut combined = Vec::with_capacity(LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(LOCAL_FORMAT_MAGIC);
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

pub fn decrypt_local(ciphertext_base64: &str, key: &[u8]) -> Result<String, CryptoError> {
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

pub fn decrypt_local_legacy(ciphertext_base64: &str, key: &[u8]) -> Result<String, CryptoError> {
    if ciphertext_base64.len() > MAX_CIPHERTEXT_BASE64_BYTES {
        return Err(CryptoError::InputTooLarge);
    }
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
pub fn fuzz_local_ciphertext(data: &[u8]) {
    if data.len() <= MAX_SECRET_BYTES + LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + TAG_LEN {
        let _ = decrypt_local(&BASE64.encode(data), &[0x42; crate::keys::KEY_LEN]);
    }
}

pub fn encrypt_with_password_bytes(
    plaintext: &[u8],
    password: &[u8],
) -> Result<String, CryptoError> {
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

pub fn decrypt_with_password_bytes(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::KEY_LEN;

    const TEST_KEY: [u8; KEY_LEN] = [0x42; KEY_LEN];
    const TEST_NONCE: [u8; NONCE_LEN] = [0x24; NONCE_LEN];
    const TEST_SALT: [u8; SALT_LEN] = [0x11; SALT_LEN];

    // Golden vectors pinned from the shipping implementation (v2.8.2). They are the
    // byte-exact compatibility contract for every future implementation of these
    // formats (crate extraction, mobile bridge). Never regenerate them to make a
    // failing test pass — a mismatch IS a format break. Synthetic key/secret only.
    // The same vectors live in test/fixtures/crypto-vectors.json for non-Rust
    // consumers; golden_vectors_match_shared_fixture_file keeps the two in sync.
    const GOLDEN_YHL2: &str = "WUhMMiQkJCQkJCQkJCQkJF/Tlxaw9YJuY6By4Y5iy/b4IlzcQVnWIotANO65HLhR";
    const GOLDEN_YHP2: &str =
        "WUhQMhEREREREREREREREREREREkJCQkJCQkJCQkJCTw0CgTeOc6O0lgi4shRu19E9mEq1BkZjXFYaEVZU8=";
    const GOLDEN_LEGACY_LOCAL: &str =
        "JCQkJCQkJCQkJCQkX9OXFrD1gm5joHLhjmLL9hJc5PhZzQnBadES2QRoq4c=";
    const GOLDEN_LEGACY_PASSWORD: &str =
        "ERERERERERERERERERERESQkJCQkJCQkJCQkJAV3G/AUdzdJwflpqAesx/K3bmL5v9C1XxRf/lZKtA==";
    const GOLDEN_LOCAL_PLAINTEXT: &str = "JBSWY3DPEHPK3PXP";
    const GOLDEN_BACKUP_PLAINTEXT: &str = "example backup";
    const GOLDEN_PASSWORD: &[u8] = b"correct horse";

    #[test]
    fn golden_yhl2_vector_is_byte_stable() {
        assert_eq!(
            encrypt_local_with_nonce(GOLDEN_LOCAL_PLAINTEXT, &TEST_KEY, TEST_NONCE)
                .expect("encryption succeeds"),
            GOLDEN_YHL2
        );
        assert_eq!(
            decrypt_local(GOLDEN_YHL2, &TEST_KEY).expect("decryption succeeds"),
            GOLDEN_LOCAL_PLAINTEXT
        );
    }

    #[test]
    fn golden_yhp2_vector_is_byte_stable() {
        assert_eq!(
            encrypt_password_v2(
                GOLDEN_BACKUP_PLAINTEXT.as_bytes(),
                GOLDEN_PASSWORD,
                TEST_SALT,
                TEST_NONCE
            )
            .expect("encryption succeeds"),
            GOLDEN_YHP2
        );
        assert_eq!(
            decrypt_with_password_bytes(GOLDEN_YHP2, GOLDEN_PASSWORD).expect("decryption succeeds"),
            GOLDEN_BACKUP_PLAINTEXT
        );
    }

    #[test]
    fn golden_legacy_vectors_remain_decryptable() {
        assert_eq!(
            decrypt_local(GOLDEN_LEGACY_LOCAL, &TEST_KEY).expect("legacy local decrypts"),
            GOLDEN_LOCAL_PLAINTEXT
        );
        assert_eq!(
            decrypt_with_password_bytes(GOLDEN_LEGACY_PASSWORD, GOLDEN_PASSWORD)
                .expect("legacy password decrypts"),
            GOLDEN_BACKUP_PLAINTEXT
        );
    }

    #[test]
    fn golden_yhp2_rejects_corruption_with_exact_errors() {
        let decoded = BASE64.decode(GOLDEN_YHP2).expect("base64 is valid");
        assert!(matches!(
            decrypt_password_v2(&decoded[..20], GOLDEN_PASSWORD),
            Err(CryptoError::InvalidFormat)
        ));
        let mut flipped_magic = decoded.clone();
        flipped_magic[0] ^= 1;
        assert!(matches!(
            decrypt_password_v2(&flipped_magic, GOLDEN_PASSWORD),
            Err(CryptoError::InvalidFormat)
        ));
        // The production dispatcher routes a non-YHP2 prefix to the legacy
        // layout, whose tag then fails — a different error than the inner parser.
        assert!(matches!(
            decrypt_with_password_bytes(&BASE64.encode(&flipped_magic), GOLDEN_PASSWORD),
            Err(CryptoError::Decryption)
        ));
        let mut flipped_tag = decoded.clone();
        let last = flipped_tag.len() - 1;
        flipped_tag[last] ^= 1;
        assert!(matches!(
            decrypt_password_v2(&flipped_tag, GOLDEN_PASSWORD),
            Err(CryptoError::Decryption)
        ));
        assert!(matches!(
            decrypt_with_password_bytes(&BASE64.encode(&flipped_tag), GOLDEN_PASSWORD),
            Err(CryptoError::Decryption)
        ));
        assert!(matches!(
            decrypt_with_password_bytes(&BASE64.encode(&decoded[..20]), GOLDEN_PASSWORD),
            Err(CryptoError::InvalidFormat)
        ));
    }

    #[test]
    fn golden_yhl2_rejects_corruption_with_exact_errors() {
        let decoded = BASE64.decode(GOLDEN_YHL2).expect("base64 is valid");
        let truncated = &decoded[..LOCAL_FORMAT_MAGIC.len() + NONCE_LEN + TAG_LEN - 1];
        assert!(matches!(
            decrypt_local(&BASE64.encode(truncated), &TEST_KEY),
            Err(CryptoError::InvalidFormat)
        ));
        let mut flipped_tag = decoded.clone();
        let last = flipped_tag.len() - 1;
        flipped_tag[last] ^= 1;
        assert!(matches!(
            decrypt_local(&BASE64.encode(&flipped_tag), &TEST_KEY),
            Err(CryptoError::Decryption)
        ));
        // A flipped magic routes to the legacy layout, whose tag then fails too.
        let mut flipped_magic = decoded;
        flipped_magic[0] ^= 1;
        assert!(matches!(
            decrypt_local(&BASE64.encode(&flipped_magic), &TEST_KEY),
            Err(CryptoError::Decryption)
        ));
    }

    #[test]
    fn oversized_local_plaintext_is_rejected_before_randomness() {
        let oversized = "A".repeat(MAX_SECRET_BYTES + 1);
        assert!(matches!(
            encrypt_local(&oversized, &TEST_KEY),
            Err(CryptoError::InputTooLarge)
        ));
        assert!(matches!(
            encrypt_local_with_nonce(&oversized, &TEST_KEY, TEST_NONCE),
            Err(CryptoError::InputTooLarge)
        ));
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
        let ciphertext = seal(b"legacy backup", key.as_ref(), TEST_NONCE, &[])
            .expect("legacy encryption succeeds");
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
        let key = derive_legacy_key(password, &salt, LEGACY_PBKDF2_ITERATIONS);
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

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct VectorFixture {
        #[serde(rename = "$comment")]
        _comment: String,
        key_base64: String,
        nonce_base64: String,
        salt_base64: String,
        password: String,
        argon2id: FixtureArgon2,
        pbkdf2_iterations: u32,
        vectors: Vec<GoldenVector>,
        rejection_vectors: Vec<RejectionVector>,
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct FixtureArgon2 {
        memory_kib: u32,
        iterations: u32,
        parallelism: u32,
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct GoldenVector {
        format: String,
        #[serde(rename = "description")]
        _description: String,
        plaintext: String,
        ciphertext_base64: String,
        decrypt_only: bool,
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct RejectionVector {
        format: String,
        #[serde(rename = "description")]
        _description: String,
        ciphertext_base64: String,
        expected: String,
    }

    fn load_vector_fixture() -> VectorFixture {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../test/fixtures/crypto-vectors.json"
        ))
        .expect("fixture file exists");
        serde_json::from_str(&raw).expect("fixture matches the typed schema")
    }

    #[test]
    fn golden_vectors_match_shared_fixture_file() {
        let fixture = load_vector_fixture();
        assert_eq!(
            BASE64.decode(&fixture.key_base64).expect("key decodes"),
            TEST_KEY
        );
        assert_eq!(
            BASE64.decode(&fixture.nonce_base64).expect("nonce decodes"),
            TEST_NONCE
        );
        assert_eq!(
            BASE64.decode(&fixture.salt_base64).expect("salt decodes"),
            TEST_SALT
        );
        assert_eq!(
            fixture.password.as_bytes(),
            GOLDEN_PASSWORD,
            "fixture password matches"
        );
        assert_eq!(fixture.argon2id.memory_kib, crate::kdf::ARGON2_MEMORY_KIB);
        assert_eq!(fixture.argon2id.iterations, crate::kdf::ARGON2_ITERATIONS);
        assert_eq!(fixture.argon2id.parallelism, crate::kdf::ARGON2_PARALLELISM);
        assert_eq!(fixture.pbkdf2_iterations, LEGACY_PBKDF2_ITERATIONS.get());
        let expected = [
            ("YHL2", GOLDEN_YHL2, GOLDEN_LOCAL_PLAINTEXT, false),
            ("YHP2", GOLDEN_YHP2, GOLDEN_BACKUP_PLAINTEXT, false),
            (
                "legacy-local",
                GOLDEN_LEGACY_LOCAL,
                GOLDEN_LOCAL_PLAINTEXT,
                true,
            ),
            (
                "legacy-password",
                GOLDEN_LEGACY_PASSWORD,
                GOLDEN_BACKUP_PLAINTEXT,
                true,
            ),
        ];
        assert_eq!(fixture.vectors.len(), expected.len());
        for (vector, (format, ciphertext, plaintext, decrypt_only)) in
            fixture.vectors.iter().zip(expected)
        {
            assert_eq!(vector.format, format);
            assert_eq!(vector.ciphertext_base64, ciphertext);
            assert_eq!(vector.plaintext, plaintext);
            assert_eq!(vector.decrypt_only, decrypt_only);
        }
    }

    #[test]
    fn shared_rejection_vectors_fail_through_production_dispatch() {
        let fixture = load_vector_fixture();
        assert!(!fixture.rejection_vectors.is_empty());
        for vector in &fixture.rejection_vectors {
            let result = match vector.format.as_str() {
                "YHL2" | "legacy-local" => decrypt_local(&vector.ciphertext_base64, &TEST_KEY),
                "YHP2" | "legacy-password" => {
                    decrypt_with_password_bytes(&vector.ciphertext_base64, GOLDEN_PASSWORD)
                }
                other => panic!("unknown rejection vector format: {other}"),
            };
            match vector.expected.as_str() {
                "invalid-format" => assert!(
                    matches!(result, Err(CryptoError::InvalidFormat)),
                    "expected InvalidFormat for {}",
                    vector.ciphertext_base64
                ),
                "auth-failure" => assert!(
                    matches!(result, Err(CryptoError::Decryption)),
                    "expected Decryption for {}",
                    vector.ciphertext_base64
                ),
                other => panic!("unknown expected outcome: {other}"),
            }
        }
    }
}
