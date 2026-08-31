use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use ring::rand::{SecureRandom, SystemRandom};
use zeroize::Zeroizing;

use crate::error::CryptoError;

pub const KEY_LEN: usize = 32;

pub fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut bytes = [0_u8; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| CryptoError::Encryption)?;
    Ok(bytes)
}

pub fn decode_key(key_base64: &str) -> Result<Zeroizing<[u8; KEY_LEN]>, CryptoError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_decoding_fails_closed() {
        assert!(decode_key("not base64").is_err());
        assert!(decode_key(&BASE64.encode([0_u8; 31])).is_err());
        assert!(decode_key(&BASE64.encode([0_u8; KEY_LEN])).is_ok());
    }
}
