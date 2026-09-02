# Mobile strategy (decision record)

Status: **decided — Expo/React Native, iOS-first**. Last reviewed: 2026-09-02.

This supersedes the previous version of this note, which recommended a Tauri 2 mobile spike with React Native as fallback. The decision flipped after four adversarial review rounds (independent Codex reviewer) weighing long-term maintenance, transferable skills, and the actual reuse economics: the maintainer plans further mobile apps (Expo/RN skills transfer; Tauri-mobile skills mostly don't), accepts the UI rewrite cost, and the supposed Tauri "reuse" advantage shrank on inspection — the desktop keyring path, folder-sync path model, lifecycle privacy, and store CI all required native-grade mobile work regardless of framework.

## Decisions (fixed)

- **Framework**: Expo/React Native. **Deliverable v1 is iOS-only**; Android is a declared follow-up plan (Kotlin Keystore adapter, Android biometric policy, backup exclusion, SAF import/export, Play signing, physical-device acceptance), not an implicit outcome.
- **Desktop stays Tauri + Vue untouched** (option A). A React DOM desktop rewrite is rejected: React Native shares no components with React DOM, so it would rewrite a working app for vocabulary, not reuse. A later single-codebase consolidation (react-native-web inside Tauri) remains open, gated on a vertical-slice parity test (keyboard, accessibility, IPC, modals) — evidence, not vibes.
- **Monorepo**: `crates/` (platform-neutral Rust), `packages/` (framework-neutral TS domain), `apps/mobile` (Expo) in this repository, bun workspaces.
- **Crypto boundary (non-negotiable)**: the encryption key and the biometric authorization decision never touch JavaScript. Rust crypto reaches mobile as a UniFFI-bound native Expo Module exposing narrow, auth-bound operations (`decryptSecret`, never `getRawKey`), with the key bound to biometrics in the Keychain item itself (`SecAccessControl(.biometryCurrentSet)`, `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, no iCloud sync) and held in an opaque native session, zeroized on close and on backgrounding.
- **One source of truth per format layer**: binary envelope parsing (`YHL2`, `YHP2`, legacy PBKDF2) lives only in the Rust crate; the TS domain package owns only JSON-level schemas and policy. Golden byte-exact vectors (`test/fixtures/crypto-vectors.json`, mirrored in `src-tauri/src/crypto.rs` tests) are the compatibility contract for every implementation.
- **Migration**: password-encrypted YHP2 export/import is the **only** desktop↔mobile path. Local `YHL2` ciphertext is bound to a per-install key and cannot move between devices by design.
- **Mobile v1 scope**: local vault, YHP2 import/export, native biometric gating, native lifecycle locking (suspend lock, app-switcher snapshot masking), sensitive-flagged clipboard (`UIPasteboard` localOnly + expiration). **No folder sync** (the desktop absolute-path model does not map to iOS security-scoped URLs). **No OTA JS updates, ever** — signed store binaries only; each release artifact is inspected to confirm `expo-updates` is absent.
- **Toolchain reality**: maintainer develops on Linux. UI iteration via Expo Go on a real iPhone; native builds via EAS cloud (pinned Rust toolchain, locked uniffi-bindgen, frozen lockfile); a macOS CI job building the XCFramework and running golden-vector XCTests is the authoritative bridge gate. Apple Developer account purchased when the native-module phase needs device installs.

## Security requirements (unchanged from the previous note)

A mobile client preserves the desktop format and threat-model properties:

- new local ciphertext uses the authenticated `YHL2` AES-256-GCM format;
- new portable backups use the `YHP2` Argon2id (64 MiB, 3 passes, 1 lane) + AES-256-GCM format;
- PBKDF2/AES-GCM files remain read-compatible only;
- encryption keys use Keychain-backed storage and fail closed when secure storage is unavailable;
- no secret, key, password, or generated code enters logs, analytics, URLs, crash metadata, or unencrypted persistence;
- biometric access gates secure-key use rather than replacing encryption;
- import, clipboard, backgrounding, screenshots, backup, and store distribution receive platform-specific abuse tests before advertising mobile support.

Formats are documented in [backup-format.md](backup-format.md). AES-GCM supplies ciphertext integrity; version 2.3 repeats sync metadata inside the authenticated plaintext.

## Execution

The implementation runs in 8 phases (golden-vector pinning → Rust crate extraction → TS domain package → lock-state machine → Expo scaffold with mocked crypto port → UniFFI/Expo-Module bridge in three sub-gates → v1 features → EAS/TestFlight). Each phase ends with an adversarial review gate; desktop CI stays green and a desktop release stays cuttable at every merge.

Status (2026-09-02):

- **Done and CI-verified**: Phase 1 (golden vectors), Phase 2 (cargo
  workspace + `crates/yhtua-crypto`), Phase 3 (bun workspace +
  `packages/domain` + conformance suite), Phase 4 (lock-state machine,
  desktop reporting adapter), Phase 5 (Expo scaffold, mocked vault,
  full lock enforcement, expo-doctor clean, iOS bundle export), Phase 6a
  (`crates/yhtua-mobile` UniFFI bridge — the macOS `Mobile bridge`
  workflow executes every golden vector through real Swift→Rust and
  packages the XCFramework).
- **Written and reviewed, awaiting device verification**: the native
  Expo module (KeyStore + module + self-test), EAS profiles and pinned
  pre-install hook, the YHP2 transfer policy (node-tested over the port),
  the Phase 7 feature set (token detail/edit/delete, QR scanning, the
  device-local self-expiring clipboard, native app-switcher masking), and
  the release procedure docs. The Swift for the clipboard and the
  lifecycle mask compiles nowhere in CI today — the macOS job builds the
  Rust XCFramework, not the Expo module — so both are device-gated in
  `release-checklist.md`.
- **Blocked on physical resources** (Apple Developer Program membership,
  a physical iPhone, `eas login`): sub-gates 6b (on-device self-test,
  biometric matrix) and 6c (EAS development build), the Phase 7 device
  walkthrough and desktop↔iPhone YHP2 acceptance, and the Phase 8
  TestFlight/App Store submission — all procedures documented in
  `docs/release-checklist.md`.

## Primary references

- [Expo documentation](https://docs.expo.dev/)
- [Expo Modules API](https://docs.expo.dev/modules/module-api/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) (not used for the vault key — Keychain access is owned by the native module)
- [UniFFI](https://mozilla.github.io/uniffi-rs/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Keychain access control](https://developer.apple.com/documentation/security/secaccesscontrol)
