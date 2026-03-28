<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Yhtua" width="100" height="100">
</p>

<h1 align="center">Yhtua</h1>

<p align="center">
  <strong>Two factors. Zero trust required.</strong><br />
  Open-source, encrypted 2FA token manager for desktop.
</p>

<p align="center">
  <a href="https://github.com/iiAku/Yhtua/releases/latest"><img src="https://img.shields.io/github/v/release/iiAku/Yhtua?style=flat-square&color=d4a54a" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://iiaku.github.io/Yhtua/">Website</a> ·
  <a href="https://github.com/iiAku/Yhtua/releases/latest">Download</a> ·
  <a href="#security">Security</a> ·
  <a href="#development">Development</a>
</p>

---

## Features

- **TOTP tokens** — 6, 7, or 8-digit codes with real-time circular countdown
- **AES-256-GCM encryption** — Secrets encrypted at rest, keys stored locally
- **Cross-device sync** — Encrypted backups via any cloud folder (Dropbox, Drive, OneDrive)
- **Auto-sync** — Background sync when tokens change, with password mismatch recovery
- **Import & export** — Password-protected backup files, legacy format support
- **Native & lightweight** — ~5MB, built with Tauri 2 and Rust
- **Fully offline** — No accounts, no telemetry, no network calls

## Download

Get the latest release for your platform from [Releases](https://github.com/iiAku/Yhtua/releases/latest).

| Platform | Formats                   |
| -------- | ------------------------- |
| Linux    | `.deb` `.AppImage` `.rpm` |
| macOS    | `.dmg`                    |
| Windows  | `.msi` `.exe`             |

## Security

All cryptographic operations run in Rust via the audited [`ring`](https://github.com/briansmith/ring) library.

```
Local storage                          Export / Sync
─────────────                          ─────────────
Tokens → AES-256-GCM → localStorage   Backup → PBKDF2 (600k) + AES-256-GCM → file
              │                                        │
        App local storage                        User password
        (OS user-scoped)
```

- **Encryption key** stored in app local storage (OS user-scoped directory)
- **Sync backups** protected with PBKDF2-SHA256 at 600,000 iterations + AES-256-GCM
- **Backup integrity** — HMAC-SHA256 signature on sync backups, verified on restore
- **Zero network calls** — sync works via local filesystem only
- **Minimum 8-character passwords** enforced for sync and export
- **Secret cache TTL** — decrypted secrets expire from memory after 30 seconds, cleared on app blur
- **Clipboard auto-clear** — copied codes cleared after 500ms, also cleared when app loses focus
- **Duplicate detection** — prevents adding tokens with the same label

## Development

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/) 1.77+

### Tech stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Frontend | Nuxt 4, Vue 3, Tailwind CSS 4 |
| Backend  | Tauri 2, Rust                 |
| Crypto   | ring (AES-256-GCM, PBKDF2)    |
| Keychain | keyring-rs                    |
| Landing  | Astro, Tailwind CSS 4         |

### Commands

```bash
# Install dependencies
bun install

# Development (desktop app with hot reload)
bun run tauri dev

# Production build
bun run tauri build

# Landing page dev
cd landing && bun install && bun run dev

# Lint & format
bun run lint
bun run format

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml
```

### Project structure

```
Yhtua/
├── app/                    # Nuxt frontend
│   ├── components/         # Vue components
│   ├── composables/        # Crypto, store, sync, OTP
│   └── pages/              # App pages
├── src-tauri/              # Tauri backend (Rust)
│   └── src/
│       ├── crypto.rs       # AES-256-GCM, PBKDF2, keychain
│       └── lib.rs          # Tauri commands
├── landing/                # Astro landing page
└── .github/workflows/      # CI: release builds + GitHub Pages
```

## Contributing

PRs welcome. Fork, branch, commit, push, open a PR.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Made in France by <a href="https://yoann.gendrey.fr">Yoann Gendrey</a> 🇫🇷
</p>
