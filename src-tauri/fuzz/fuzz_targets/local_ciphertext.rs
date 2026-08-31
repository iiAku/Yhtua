#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    yhtua_crypto::fuzz_local_ciphertext(data);
});
