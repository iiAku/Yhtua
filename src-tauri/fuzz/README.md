# Rust fuzzing

The `local_ciphertext` target exercises local ciphertext framing, legacy-format compatibility, truncation handling, and authenticated decryption without accessing the OS credential store.

Install `cargo-fuzz`, then run from `src-tauri`:

```sh
cargo +nightly fuzz run local_ciphertext -- -max_len=4128
```

LibFuzzer requires the nightly Rust sanitizer toolchain, so this long-running target is intentionally separate from normal stable CI. Deterministic regression tests cover known malformed, tampered, legacy, and current ciphertext cases on every CI run.
