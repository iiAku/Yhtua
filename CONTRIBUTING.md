# Contributing

## Toolchain

- Bun 1.4.0 or newer
- Node.js 22.12 or newer (for ecosystem tools)
- Rust 1.93.1 with `rustfmt` and `clippy`
- Linux Tauri packages listed in the CI workflow when building on Linux

Install with `bun install --frozen-lockfile`. Use synthetic Base32 secrets only; never commit or paste real credentials into issues, fixtures, logs, screenshots, or CI.

## Required checks

Run before opening a pull request:

```sh
bun run check
bun audit
cargo fmt --all -- --check
cargo clippy --workspace --locked --all-targets -- -D warnings
cargo test --workspace --locked
cargo audit --file Cargo.lock
cargo deny check
```

Security-sensitive changes require tests for failure behavior and backward compatibility. Do not weaken schemas, permissions, CSP, cryptographic parameters, or assertions to make a check pass. Update the changelog and relevant format/threat-model documentation when behavior or trust boundaries change.

Pull requests should be focused, explain user-visible and security impact, identify platform testing performed, and disclose tests that could not be run.
