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
needs a reason here and a revisit condition, and the `audit` script in
`package.json` passes it with `--ignore`; CI and release preflight run that script.

- `GHSA-vfj7-8cjw-p6xm` (`braces` <= 3.0.3, deeply nested pattern denial of service). Included by build/development tooling through Metro and Nitro’s `micromatch`; the patterns come from the repository, not vault files, and the glob parser is not included in the native app. The GitHub advisory lists no patched version as of 2026-10-17. Revisit when a fix is published or the parent packages remove it.
- `GHSA-86w9-cpqp-85rv` (`node-forge` <= 1.4.0, RSA signature verification). Included by Expo CLI and Nitro’s `listhen` for local development certificates, not application signature verification; not included in the native app. The GitHub advisory lists no patched version as of 2026-10-17. Revisit when a fixed version is published.

The mobile dependency refresh also aligns the patched build-tool overrides with desktop main (`brace-expansion`, `simple-git`, `shell-quote`) and adds patched `sharp`, `source-map-js`, and `http-cache-semantics` versions. `react-native-screens` is constrained to the Expo-supported 4.26.x series across requesters so the native build has one copy. Expo Doctor and the browser/native build gates verify this constraint; remove it when normal resolution deduplicates the compatible version.
