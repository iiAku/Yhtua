# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses semantic versioning.

## [Unreleased]

## [2.8.2] - 2026-08-03

### Fixed

- Fixed credential recovery so an unreadable pre-2.7.1 credential file no longer blocks every credential lookup. That file is keyed to the machine name, so renaming the device made it permanently undecryptable, and propagating the failure left the application unable to read _or create_ its encryption key — every backup import ended in "Decryption failed". Reading it is now best-effort, and the encryption key is never replaced while a readable legacy key still awaits migration.
- Fixed the import, export, sync-recovery and token-import dialogs, which never rendered at all because they were missing the `open` state Headless UI requires.
- Fixed import of backups written by earlier releases: version `1.0`, free-form algorithm casing and a missing issuer are accepted again, and imported tokens are converted to the current schema and re-encrypted on the way in.
- Fixed import and sync restore rejecting valid backups over the vestigial `hmac` field written before 2.7.1, which had made existing remote backups unreadable.
- Fixed imported tokens disappearing after a reload when the same identifiers had previously been deleted; adding a token now clears its tombstone instead of colliding with it.
- Fixed import and export reporting nothing at all: failures appear inline in the dialog, the underlying error from the operating system is shown instead of being discarded, and notifications are no longer drawn beneath the open dialog.
- Fixed the copy action leaving the clipboard empty. The automatic clear ran 500 ms after the copy and again whenever the window was hidden or the page left, which is exactly when a code is being pasted.

### Changed

- The clipboard now retains a copied code for 30 seconds, cleared by a timer alone, and ownership is tracked by fingerprint so a code is no longer held in memory after leaving the page.
- Importing no longer asks for confirmation. It only ever adds tokens, and the browser-level prompt is unreliable in the Linux webview. Destructive confirmations use the in-application dialog instead.

### Performance

- Moved every cryptographic command off the main thread. Argon2id key derivation and credential-store access previously blocked the interface for the duration of each call, and the legacy key derivation was repeated on every lookup.

## [2.8.1] - 2026-07-31

### Build/Release

- Updated Gitleaks Action to its Node 24-based v3 release and suppressed incompatible TypeScript major-update automation until the Vue type-checking stack supports it.
- Restored the established application and website icon set exactly as shipped before version 2.8.0.
- Restored the AppImage Wayland compatibility patch, removed the conflicting bundled `libwayland-client`, and added a packaged-app launch/render smoke test.

## [2.8.0] - 2026-07-31

### Security

- Replaced the machine-derived credential-file fallback with fail-closed OS credential storage and one-time legacy migration.
- Added a versioned Argon2id (64 MiB, 3 passes, 1 lane) plus AES-256-GCM backup envelope while retaining read compatibility with PBKDF2 backups.
- Added authenticated format markers, OS CSPRNG nonces/salts, input limits, key validation, secret zeroization where Rust permits, and tamper/wrong-password tests.
- Removed unrestricted Tauri filesystem capabilities and routed bounded backup operations through symlink-aware, atomic Rust commands.
- Added a restrictive application CSP, ownership-aware clipboard clearing, and route-exit cleanup for decrypted secrets and passwords.
- Replaced the established icon set during the unpublished release; this unintended branding change is reverted in the next release.

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

[Unreleased]: https://github.com/iiAku/Yhtua/compare/v2.8.2...HEAD
[2.8.2]: https://github.com/iiAku/Yhtua/compare/v2.8.1...v2.8.2
[2.8.1]: https://github.com/iiAku/Yhtua/compare/549dfb95f7703d54678a9ca1cb1a96f5d8f08c41...v2.8.1
[2.8.0]: https://github.com/iiAku/Yhtua/compare/v2.7.2...549dfb95f7703d54678a9ca1cb1a96f5d8f08c41
