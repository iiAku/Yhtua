<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Yhtua" width="100" height="100">
</p>

<h1 align="center">Yhtua</h1>

<p align="center">Open-source desktop TOTP manager with encrypted local storage and portable backups.</p>

<p align="center">
  <a href="https://iiaku.github.io/Yhtua/"><img src="https://img.shields.io/badge/website-iiaku.github.io%2FYhtua-d4a54a?style=flat-square" alt="Website"></a>
  <a href="https://github.com/iiAku/Yhtua/releases/latest"><img src="https://img.shields.io/github/v/release/iiAku/Yhtua?style=flat-square&color=d4a54a" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="MIT license"></a>
</p>

[Website](https://iiaku.github.io/Yhtua/) · [Download](https://github.com/iiAku/Yhtua/releases/latest) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Features

- TOTP with SHA-1/SHA-256/SHA-512, 6–8 digits, and bounded custom periods
- AES-256-GCM encryption for secrets stored in the WebView profile
- Random local key held by macOS Keychain, Windows Credential Manager, or Linux Secret Service
- Argon2id + AES-256-GCM portable exports and folder sync, with legacy PBKDF2 backup reading
- Conflict merging, deletion tombstones, atomic file replacement, and five recovery copies
- No Yhtua account, hosted sync service, analytics, or telemetry

## Supported packages

The release matrix validates these targets. Availability is authoritative only when the matching artifact exists on the [GitHub release](https://github.com/iiAku/Yhtua/releases/latest).

| Platform | Architecture          | Packages                 |
| -------- | --------------------- | ------------------------ |
| Linux    | x86_64                | AppImage, `.deb`, `.rpm` |
| macOS    | Apple silicon (arm64) | `.dmg`                   |
| Windows  | x86_64                | `.msi`, NSIS `.exe`      |

Artifacts may be unsigned when repository signing credentials are not configured; release notes must state the signing/notarization status. Checksums and CycloneDX SBOMs accompany release artifacts.

## Architecture

```text
Nuxt 4 / Vue 3 UI
  ├─ strict Zod schemas and encrypted Zustand vanilla persistence
  └─ narrow Tauri IPC calls
        ├─ Rust: ring AES-256-GCM / PBKDF2 compatibility
        ├─ RustCrypto Argon2id
        ├─ keyring-rs platform credential stores
        └─ bounded, symlink-aware atomic backup I/O

Astro 7 landing site → static GitHub Pages deployment
```

The Tauri capability grants the main window core defaults, folder selection, and clipboard read/write only. It does not grant general filesystem or shell/process access. The application and landing site use restrictive CSPs.

## Security model

Local token ciphertext is stored in the WebView's OS-user-scoped application profile; its key is stored separately in the OS credential service. New backups derive a 256-bit key with Argon2id (64 MiB, 3 passes, 1 lane) and use AES-256-GCM authenticated encryption. Older PBKDF2-SHA256 (600,000 iteration) backups remain readable but are not newly written. Format details are in [docs/backup-format.md](docs/backup-format.md).

Upgrading from an earlier release is automatic and non-destructive: legacy local ciphertext and password backups remain readable, and legacy credential identifiers/files are migrated into stable OS credential-store entries. See [the 2.8 migration notes](docs/migration-2.8.md) before rolling out broadly.

Encryption at rest does not protect against malware or another process running as the same OS user while Yhtua or the credential store is unlocked. Generated codes and decrypted secrets necessarily exist briefly in process memory; JavaScript strings cannot be reliably zeroized. Clipboard managers and screenshots can retain codes. No audit can guarantee absolute security or that software is vulnerability-free. See [the threat model](docs/threat-model.md) and report vulnerabilities privately per [SECURITY.md](SECURITY.md).

## Development

Prerequisites:

- Bun 1.4.0+
- Node.js 22.12+
- Rust 1.93.1 with `rustfmt` and `clippy`
- platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```sh
bun install --frozen-lockfile
bun run tauri dev

# Frontend quality gate
bun run check
bun audit

# Rust quality/security gate
cargo fmt --all -- --check
cargo clippy --workspace --locked --all-targets -- -D warnings
cargo test --workspace --locked
cargo audit --file Cargo.lock
cargo deny check
```

The app production command is `bun run tauri build`; landing development is `bun run --cwd landing dev`. Use only synthetic credentials in development and tests.

## Releases

The root `package.json` is the human-edited version source. `bun run version:bump X.Y.Z` synchronizes Cargo, Tauri, and landing metadata; `bun run check:version` fails on drift or hard-coded landing versions. Tagged release automation validates the tag and all gates before publishing platform artifacts, checksums, SBOMs, provenance attestations, and the matching Pages site. Follow [the release checklist](docs/release-checklist.md).

## License and notices

Yhtua is distributed under the [MIT License](LICENSE). See [ASSET-LICENSES.md](ASSET-LICENSES.md) for bundled asset notes and [docs/dependency-policy.md](docs/dependency-policy.md) for dependency governance.
