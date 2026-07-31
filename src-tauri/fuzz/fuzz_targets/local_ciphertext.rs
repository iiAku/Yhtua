#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    app_lib::fuzz_local_ciphertext(data);
});
