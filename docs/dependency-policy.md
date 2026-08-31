# Dependency update policy

Dependabot checks Bun/npm, Cargo, and GitHub Actions weekly and groups low-risk updates. Security updates are prioritized. Direct dependencies should use current stable mutually compatible releases; prereleases require a documented need.

For every update:

- read upstream release/migration and security notes, especially for Nuxt, Astro, Tauri, keyring, cryptography, and file APIs;
- regenerate `bun.lock`, `Cargo.lock`, and `src-tauri/fuzz/Cargo.lock` using the declared toolchains;
- run `bun audit`, `cargo audit`, and `cargo deny` and investigate the inclusion path of every finding;
- test Linux, macOS, and Windows when platform integration changes;
- avoid blanket advisory suppression. Every cargo-deny ignore requires a narrow reason and remains visible in output;
- keep GitHub Actions pinned to immutable commit SHAs and let Dependabot update the pins;
- remove unused dependencies instead of retaining them for convenience.

JavaScript `overrides` are limited to patched versions compatible with all requesting packages. A clean build/test plus `bun why` review is required whenever an override changes.

The repository pins the current Rust stable toolchain (`1.93.1`) in CI and declares the same MSRV. TypeScript is held to the newest compatible major (`6.x`): TypeScript 7 removes the compiler subpath currently required by `vue-tsc` 3.3.8. Re-test and remove this hold when Vue language tooling adds TypeScript 7 support.

## Documented JavaScript advisory ignores

Mirrors the RUSTSEC ignore pattern in `deny.toml`: every ignored advisory
needs a reason here and a revisit condition.

- `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` (`image-size` <= 2.0.2, DoS
  via crafted ICNS/JXL/HEIF images): transitive via Metro inside the pinned
  Expo SDK; no fixed release satisfies Metro's range, and the parser only
  runs at development bundle time on files already in the repository.
  Revisit on every Expo SDK upgrade and drop the ignore once Metro moves to
  image-size >= 2.0.3.
