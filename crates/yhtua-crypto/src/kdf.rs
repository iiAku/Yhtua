use argon2::{Algorithm, Argon2, Params, Version};
use ring::pbkdf2;
use std::num::NonZeroU32;
use zeroize::Zeroizing;

use crate::error::CryptoError;
use crate::keys::KEY_LEN;

pub const LEGACY_PBKDF2_ITERATIONS: NonZeroU32 = NonZeroU32::new(600_000).unwrap();

pub(crate) const ARGON2_MEMORY_KIB: u32 = 64 * 1024;
pub(crate) const ARGON2_ITERATIONS: u32 = 3;
pub(crate) const ARGON2_PARALLELISM: u32 = 1;

/// The iteration count is `NonZeroU32` so a zero count is unrepresentable at
/// this public boundary, and the key comes back zeroizing so no caller can
/// forget to wipe it.
pub fn derive_legacy_key(
    password: &[u8],
    salt: &[u8],
    iterations: NonZeroU32,
) -> Zeroizing<[u8; KEY_LEN]> {
    let mut key = Zeroizing::new([0_u8; KEY_LEN]);
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        iterations,
        salt,
        password,
        key.as_mut(),
    );
    key
}

pub(crate) fn derive_argon2id_key(
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

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

    #[test]
    fn pbkdf2_sha256_matches_known_vector() {
        let key = derive_legacy_key(b"password", b"salt", NonZeroU32::new(1).expect("non-zero"));
        assert_eq!(
            BASE64.encode(key.as_ref()),
            "Eg+2z/z4syxD5yJSVsT4N6hlSMkszDVICAWYfLcL4Xs="
        );
    }
}
