# Mobile strategy (planning note)

Status: exploratory; Yhtua 2.8 supports desktop only. Last reviewed: 2026-07-31.

Mobile framework capabilities, store policies, pricing, and ecosystem maturity change frequently. Revalidate this note against current primary documentation before committing to an implementation or budget.

## Non-negotiable security requirements

A mobile client must preserve the desktop format and threat-model properties:

- new local ciphertext uses the authenticated `YHL2` AES-256-GCM format;
- new portable backups use the `YHP2` Argon2id (64 MiB, 3 passes, 1 lane) plus AES-256-GCM format;
- supported PBKDF2/AES-GCM files remain read-compatible only;
- encryption keys use Keychain/Keystore-backed storage and fail closed when secure storage is unavailable;
- no secret, key, password, or generated code enters logs, analytics, URLs, crash metadata, or unencrypted persistence;
- biometric access gates secure-key use rather than replacing encryption;
- import, clipboard, backgrounding, screenshots, backup, and sync receive platform-specific abuse tests.

The current formats are documented in [backup-format.md](backup-format.md). There is no separate HMAC layer: AES-GCM supplies ciphertext integrity, and version 2.3 repeats sync metadata inside the authenticated plaintext.

## Options to prototype

### Tauri 2 mobile

Tauri officially documents Android and iOS targets, store distribution, mobile plugins, capabilities, biometrics, clipboard, and deep links. This path maximizes reuse of the current Vue UI, Rust commands, schemas, and capability model. It still requires device testing across WebView versions and a review of each plugin's mobile implementation and secure-storage behavior.

Start here for the smallest proof of concept, but do not infer production readiness from desktop test results. iOS development still requires macOS and Xcode.

### React Native with Expo

Expo provides documented SecureStore, LocalAuthentication, and Clipboard modules and managed build/update services. It offers a broad mobile-oriented API surface but requires a Vue-to-React UI rewrite and either a reviewed native bridge to Rust or a separate cryptographic implementation. SecureStore persistence, biometric invalidation, backup behavior, and platform limits must be tested explicitly.

### Kotlin/Compose Multiplatform

This offers native Android integration and shared Kotlin UI/business code, with an iOS target and a possible UniFFI bridge to Rust. It is a larger rewrite and introduces Kotlin/Gradle and native bridge maintenance. Consider it when native UI control outweighs reuse of the existing frontend.

### Flutter

Flutter also implies a full UI rewrite and a maintained Dart-to-Rust bridge if the existing format implementation is retained. Do not reimplement the cryptographic formats solely to accommodate a framework choice.

## Recommended decision process

1. Extract format/crypto primitives from `src-tauri/src/crypto.rs` into a platform-neutral Rust crate without keychain, filesystem, logging, or Tauri dependencies.
2. Build a time-boxed Tauri mobile spike covering Keychain/Keystore access, biometric gating, background secret clearing, clipboard ownership, import/export, and one real iOS and Android device.
3. In parallel, validate a minimal Expo native bridge only if the Tauri spike exposes a blocking WebView, plugin, accessibility, or store-distribution issue.
4. Compare measured startup time, binary size, accessibility, device coverage, maintenance burden, and security-test results. Do not decide from ecosystem popularity claims.
5. Add mobile CI, signing, store privacy disclosures, migration tests, and a separate threat-model review before advertising mobile support.

## Shared Rust crate boundary

A future shared crate should expose typed operations such as:

- random-key generation;
- local `YHL2` encrypt/decrypt;
- portable `YHP2` encrypt/decrypt;
- legacy PBKDF2 backup decryption;
- strict envelope parsing and format-version errors.

Keychain/Keystore access, biometrics, file selection, clipboard, lifecycle, and UI remain platform adapters. Keep secret-bearing arguments out of generic error text and zeroize Rust buffers where practical.

## Updates and store policy

The default release channel should remain signed store updates. Do not enable executable over-the-air updates until their integrity, rollback, disclosure, and review-policy implications have been assessed. Apple's current App Review Guideline 2.5.2 restricts downloaded code that changes app functionality, so any update mechanism must be reviewed against the policy in force at submission time.

## Primary references

- [Tauri prerequisites and mobile target setup](https://v2.tauri.app/start/prerequisites/)
- [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Expo Clipboard](https://docs.expo.dev/versions/latest/sdk/clipboard/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
