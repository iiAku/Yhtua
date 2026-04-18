# Yhtua Mobile Strategy — Research & Decisions

## Context

Yhtua is a desktop 2FA token manager built with Tauri 2 (Rust backend) + Nuxt 4 (Vue 3 frontend). The goal is to ship on iOS and Android while preserving the battle-tested Rust crypto layer (`ring` — AES-256-GCM, PBKDF2, HMAC-SHA256).

## Framework Evaluation

### Tauri Mobile

- Tauri 2 has stable mobile support (Oct 2024) but **no confirmed production apps on App/Play Store** as of early 2026
- Spacedrive explored Tauri Mobile, ended up using React Native
- Android WebView fragmentation is a known pain point
- Biometrics, push notifications, deep linking plugins are immature
- Lowest effort path (~days) since codebase already uses Tauri, but risky for a consumer 2FA app

**Verdict**: good for prototype/validation, not recommended for a polished consumer release.

### Kotlin Multiplatform (KMP) + Compose Multiplatform

- Truly native UI, first-class biometric/Keystore/Keychain access
- Rust crypto bridgeable via UniFFI + Gobley Gradle plugin (proven at scale by Mozilla Firefox, Element/Matrix E2EE, Zcash)
- Requires Mac for iOS builds
- Full UI rewrite (Vue → Compose)
- Smaller developer ecosystem than React Native
- ~3-4 weeks to MVP

**Verdict**: strong option if native UI matters or team knows Kotlin. Overkill for a 5-screen utility app.

### Expo (React Native) — Recommended

- Most mature mobile ecosystem (10+ years, thousands of shipped apps)
- Batteries included: `expo-secure-store` (Keychain/Keystore), `expo-local-authentication` (biometrics), `expo-clipboard`
- EAS Build: cloud iOS builds from Linux (no Mac needed)
- OTA updates: push JS fixes without App Store review
- Rust crypto bridgeable via `uniffi-bindgen-react-native` (same UniFFI crate)
- Full UI rewrite (Vue → React), but CLAUDE.md already documents extensive React patterns
- ~2-3 weeks to MVP

**Verdict**: best balance of ecosystem maturity, developer experience, and shipping speed.

### Flutter

- Rewrite everything including crypto layer (Dart has no `ring` equivalent at same trust level)
- Two codebases to maintain
- Not recommended given existing Rust investment

## Architecture — Expo Path

### Shared Rust Crypto Crate

Extract pure crypto functions from `src-tauri/src/crypto.rs` into a standalone crate:

```
yhtua-crypto/
├── Cargo.toml          # deps: uniffi, ring, base64, rand, thiserror
├── src/
│   └── lib.rs          # uniffi-annotated pure crypto functions
```

Functions to expose via UniFFI:
- `encrypt_with_key` / `decrypt_with_key` (AES-256-GCM)
- `encrypt_with_password` / `decrypt_with_password` (PBKDF2 + AES-256-GCM)
- `generate_encryption_key`
- `hmac_sha256` / `verify_hmac_sha256`

Platform-specific (NOT bridged, rewritten natively):
- Keychain/Keystore access → `expo-secure-store`
- Biometric unlock → `expo-local-authentication`
- File paths → Expo FileSystem
- Clipboard → `expo-clipboard`

### Project Structure

```
yhtua/
├── src-tauri/              # existing desktop app (unchanged)
├── app/                    # existing Vue/Nuxt desktop frontend (unchanged)
├── yhtua-crypto/           # extracted Rust crate (shared between desktop + mobile)
├── mobile/                 # new Expo app
│   ├── app/                # Expo Router (file-based routing)
│   ├── components/
│   ├── hooks/
│   ├── stores/             # Zustand
│   └── app.json
├── landing/                # existing Astro landing page
```

Desktop Tauri app keeps importing crypto.rs directly (thin wrappers around shared crate). Mobile app imports the same crypto via UniFFI bindings.

### Code Sharing Between Desktop and Mobile

Desktop is Vue, mobile is React — UI components are NOT shared. Shared layer is limited to:
- Rust crypto crate (via Tauri commands on desktop, via UniFFI on mobile)
- Zod schemas / types (can be extracted to a shared TS package)
- Business logic (TOTP generation, token parsing)

A full unification (one codebase, all platforms) would require rewriting desktop to React Native Web in Expo, wrapped in Tauri. Not worth it for 5 screens — unify later if maintaining two UIs becomes a burden.

## Cost

| Item | Cost |
|---|---|
| Expo + EAS (free tier) | $0 (30 builds/month) |
| Apple Developer Program | $99/year |
| Google Play Developer | $25 one-time |
| Mac for iOS | $0 (EAS builds in cloud) |
| **Year 1 total** | **$124** |
| **Subsequent years** | **$99/year** |

### Avoiding EAS Build Limits

EAS Build is not self-hostable, but you don't need it:
- Android: build locally or in GitLab CI (standard `./gradlew assembleRelease`)
- iOS: 30 free builds/month is plenty; alternatively, a Mac Mini (~$600) as GitLab runner for unlimited builds

## OTA Updates

### Recommended: Simple Version Check (start here)

No Expo OTA dependency. Check GitHub Releases API on launch:

```typescript
const latest = await fetch(
  "https://api.github.com/repos/iiAku/Yhtua/releases/latest"
).then((r) => r.json());

if (semver.gt(latest.tag_name, APP_VERSION)) {
  showUpdateBanner(latest.tag_name);
}
```

### Optional: Self-Hosted expo-updates (add later if needed)

Point `expo-updates` at your own server instead of EAS Update:

```json
{
  "expo": {
    "updates": {
      "url": "https://updates.yhtua.app/api/manifest",
      "enabled": true,
      "checkAutomatically": "ON_LAUNCH"
    }
  }
}
```

Requires two endpoints: `GET /api/manifest` and `GET /assets/<hash>`. ~100 LOC server, or use community `expo-updates-server` reference implementation.

### Apple OTA Rules

OTA is allowed for bug fixes and minor changes. Feature additions via OTA are a grey area — go through App Store review for new features. For a 2FA app, OTA is most valuable for emergency TOTP calculation fixes where users could be locked out.

## UniFFI Setup — Quick Reference

### Rust Crate

```toml
[lib]
crate-type = ["cdylib", "staticlib"]

[dependencies]
uniffi = "0.31"
ring = "0.17"
base64 = "0.22"
rand = "0.8"
thiserror = "2"

[build-dependencies]
uniffi = { version = "0.31", features = ["build"] }
```

```rust
uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CryptoError {
    #[error("Encryption failed: {msg}")]
    EncryptionFailed { msg: String },
    #[error("Decryption failed: {msg}")]
    DecryptionFailed { msg: String },
    #[error("Invalid data format")]
    InvalidFormat,
}

#[uniffi::export]
pub fn encrypt_with_password(plaintext: String, password: String) -> Result<String, CryptoError> {
    // existing logic
}
```

### React Native Bindings

Use `uniffi-bindgen-react-native` to generate Turbo Module bindings from the same crate.

### Production References

UniFFI is used in production by:
- Mozilla Firefox (hundreds of millions of users) — sync encryption
- Element/Matrix — full E2EE (matrix-sdk-crypto-ffi)
- Zcash — wallet crypto operations

## Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Mobile framework | Expo (React Native) | Mature ecosystem, cloud iOS builds, batteries included |
| Crypto sharing | UniFFI Rust crate | Reuse battle-tested `ring` crypto, proven at scale |
| Desktop rewrite | No (keep Vue/Tauri) | Not worth rewriting 5 working screens for code sharing |
| OTA updates | GitHub version check → self-hosted expo-updates if needed | Zero infra to start |
| Build infrastructure | EAS free tier (iOS) + GitLab CI (Android) | $0 operational cost |
