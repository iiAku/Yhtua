# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses semantic versioning.

## [Unreleased]

## [2.8.0] - 2026-07-31

### Security

- Replaced the machine-derived credential-file fallback with fail-closed OS credential storage and one-time legacy migration.
- Added a versioned Argon2id (64 MiB, 3 passes, 1 lane) plus AES-256-GCM backup envelope while retaining read compatibility with PBKDF2 backups.
- Added authenticated format markers, OS CSPRNG nonces/salts, input limits, key validation, secret zeroization where Rust permits, and tamper/wrong-password tests.
- Removed unrestricted Tauri filesystem capabilities and routed bounded backup operations through symlink-aware, atomic Rust commands.
- Added a restrictive application CSP, ownership-aware clipboard clearing, and route-exit cleanup for decrypted secrets and passwords.
- Replaced an icon set with incomplete provenance metadata with an original MIT-licensed vector and regenerated platform assets.

### Fixed

- Fixed landing/application version drift, stale Cargo lock metadata, clipboard rotation races, secret-cache expiration, live token-list refresh, stable token ordering, and TypeScript errors.
- Fixed encryption-key recovery so reset rotates the OS credential before discarding unreadable token state.
- Fixed keyboard selection of TOTP digit length and added accessible dialog/input names, visible focus, and reduced-motion behavior.
- Prevented malformed, oversized, duplicate-ID, unknown-field, and device-bound ciphertext imports while salvaging valid records from partially malformed legacy local state.
- Preserved distinct accounts that share a display label, merged usage ordering independently from content conflicts, retained deletion tombstones (including when deleting the last token), authenticated sync metadata, and refused oversized sync merges instead of writing an unreadable backup.

### Changed

- New portable backup schema version is 2.3.0; older supported encrypted backups remain readable.
- Raised the Rust MSRV to 1.93.1 and the Node baseline to 22.12.

### Dependencies

- Updated Nuxt, Vue, Astro, Tauri, keyring, and build tooling to current compatible stable releases.
- Removed the unused direct Vue Router and frontend filesystem-plugin dependencies.

### Testing

- Added RFC 6238, parser-boundary, merge/tombstone, cryptographic corruption, legacy compatibility, keychain-failure mock, clipboard-race, accessibility-component, and atomic-file tests plus a Rust fuzz target.

### Build/Release

- Added frozen installs, version consistency gates, RustSec/cargo-deny policy, SBOM/checksum preparation, and hardened automation.

[Unreleased]: https://github.com/iiAku/Yhtua/compare/v2.8.0...HEAD
[2.8.0]: https://github.com/iiAku/Yhtua/compare/v2.7.2...v2.8.0
