# Threat model

## Scope and assets

Assets are TOTP seed secrets, generated codes, the local encryption key, sync/export passwords, encrypted token state, backup history, and recovery availability. The supported security boundary is a trusted Yhtua binary running in a trusted OS-user session.

## Trust boundaries

```text
User input / imported JSON
          │
          ▼
Nuxt UI + strict schemas ── Tauri IPC ── Rust crypto / bounded file commands
          │                                  │
          ▼                                  ├── OS credential store
Encrypted WebView storage                    └── selected sync directory
                                                   │
                                                   ▼
                                           third-party sync client
```

The bundled frontend is trusted but receives attacker-controlled import and sync data. Tauri IPC is a privilege boundary. The platform credential store, filesystem, WebView, OS RNG, and installed WebKit/WebView runtime are external dependencies. Cloud-folder providers see encrypted files and metadata such as names, sizes, and timestamps.

## Primary abuse cases and controls

| Abuse case                                                | Control                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Read local storage after copying a profile                | Per-install random AES-256-GCM key in the OS credential store; no new disk fallback                             |
| Guess a backup password offline                           | Argon2id (64 MiB, 3 passes, 1 lane), random 128-bit salt; users still need strong unique passwords              |
| Modify or truncate a backup                               | AES-GCM authentication, authenticated v2.3 sync metadata, strict versioned schema, corruption rejection         |
| Oversized or malicious import                             | 24 MiB encrypted-file/16 MiB plaintext limits, 10,000-token cap, bounded fields, strict unknown-field rejection |
| Path traversal/symlink overwrite                          | Fixed sync filename, canonical directory, symlink rejection, atomic same-directory replacement, 0600 Unix mode  |
| Compromised remote sync destroys local state              | Unreadable remote files are never overwritten; previous valid remote content is copied before replacement       |
| Clipboard race clears another value or leaves an old code | Read-before-clear ownership check using the exact copied value                                                  |
| Remote web content invokes Tauri                          | Bundled local frontend only, restrictive CSP, no navigation/shell capability, least-privilege commands          |
| Supply-chain compromise                                   | Frozen locks, dependency audits, cargo-deny, secret scanning, CodeQL, pinned CI actions, checksums/SBOM         |

## Out of scope / residual risk

- Malware or an attacker operating as the same OS user can inspect memory, call accessibility APIs, capture the screen, replace application files, or access an unlocked credential store.
- JavaScript secrets are immutable strings and cannot be deterministically erased; the cache lifetime is minimized, not guaranteed.
- Clipboard history and third-party clipboard managers may retain codes after Yhtua clears the current clipboard.
- Cloud clients can roll back, duplicate, or conflict files; five safety copies reduce but do not eliminate recovery risk.
- Linux uses the Tauri GTK3/WebKitGTK stack, which currently carries documented unmaintained transitive Rust bindings and one RustSec soundness warning in an API Yhtua does not call.
- GitHub Pages does not permit repository-defined HTTP response headers. The landing page uses a strict CSP and referrer policy in HTML, but directives that require response headers (notably `frame-ancestors`) cannot be enforced there.
- No independent penetration test or formal cryptographic audit is claimed.

## Mobile client (iOS, in development)

The mobile client preserves the desktop format properties (same Rust crate,
byte-exact golden vectors) with a stricter runtime posture:

| Abuse case                                            | Control                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device loss / theft                                   | Vault key in the iOS Keychain behind `SecAccessControl(.biometryCurrentSet)` with `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`; the Keychain fetch IS the biometric check (single authorization path, no separate LAContext gate); never synchronized to iCloud |
| Biometric re-enrollment (attacker adds a face/finger) | `.biometryCurrentSet` invalidates the key item on enrollment change — the vault becomes unreadable; recovery is a YHP2 backup import (documented, intended)                                                                                                          |
| Key exfiltration via JS                               | The key never crosses into JavaScript: the native module exposes narrow operations (`decryptSecret`, batch decrypt, YHP2 import/export) and no `getRawKey`; key generation happens in Swift (SecRandomCopyBytes), never as an FFI return value                       |
| Plaintext at rest                                     | Mobile at-rest invariant: the store rejects non-ciphertext tokens in every mutation and drops them during hydration; plaintext backup import is refused outright (desktop converts)                                                                                  |
| App-switcher snapshot / backgrounding                 | Shared lock machine with zero-grace config (`backgroundLockMs: 0`): every real backgrounding clears the JS secret cache and requires re-authentication; native snapshot masking lands with the device-test phase                                                     |
| Stale async decrypts after lock                       | `secretEpoch` in the lock machine: in-flight decrypts that resolve after a cache clear are refused                                                                                                                                                                   |
| Malicious YHP2 file                                   | Envelope parsed only in Rust with pinned rejection vectors (truncation, flipped magic, flipped auth tag); JSON policy layer enforces the shared strict schemas and limits                                                                                            |
| Migration between devices                             | Password-encrypted YHP2 export/import is the ONLY path; local YHL2 ciphertext is bound to a per-device key by design                                                                                                                                                 |

Residual risk: decrypted codes and inbound FFI staging copies exist
transiently in process memory while the app is unlocked — the same exposure
class as displaying the code on screen. No OTA JavaScript updates, ever:
release binaries are signed store builds only.
