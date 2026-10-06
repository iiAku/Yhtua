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

The repository pins the current Rust stable toolchain (`1.99.0`) in CI and declares the same MSRV. TypeScript is held to the newest compatible major (`6.x`): TypeScript 7 ships no JavaScript compiler API (its package only exports `./unstable/*`), which `vue-tsc` 3.3.12 still requires. Re-test and remove this hold when Vue language tooling adds TypeScript 7 support.

## Documented JavaScript advisory ignores

Mirrors the RUSTSEC ignore pattern in `deny.toml`: every ignored advisory
needs a reason here and a revisit condition, and the `audit` script in
`package.json` passes it with `--ignore`; CI and the release preflight both
run that script.

- `GHSA-vfj7-8cjw-p6xm` (`braces` <= 3.0.3, stack-exhaustion DoS from deeply
  nested patterns). Reached only through `micromatch` in Nitro's `globby`,
  which expands glob patterns written in this repository at build time;
  nothing is shipped in an application package. No patched release exists.
  Revisit when `braces` publishes a fix or `micromatch` drops it.
- `GHSA-86w9-cpqp-85rv` (`node-forge` <= 1.4.0, lax RSA PKCS#1 v1.5 signature
  verification). Reached only through Nitro's `listhen`, which uses it to
  create local development-server certificates, not to verify
  untrusted signatures; it is not shipped. No patched release exists. Revisit
  when `node-forge` publishes a fix.
