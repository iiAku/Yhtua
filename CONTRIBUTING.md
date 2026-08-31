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

## Mobile (apps/mobile)

- The shared conformance fixtures in `packages/domain` run in every client's
  suite; a security-relevant behavior change must update the fixtures, never
  fork a per-client copy.
- Synthetic Base32 secrets only — in fixtures, tests, screenshots, and the
  dev mock vault (which refuses anything else by design).
- Native-artifact discipline: every native dependency or config change
  (including Expo SDK upgrades) requires a fresh development build AND a
  passing on-device vault self-test before any feature testing — a stale
  binary silently validates mocked paths.
- The native module's `index.ts` is the audit artifact for what JavaScript
  can ask of the native layer. Anything that widens it (or adds a way to
  read the vault key) must be called out explicitly in review.
