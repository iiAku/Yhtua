# Release checklist

1. Review [the dependency policy](dependency-policy.md), threat model changes, and all changelog entries.
2. Choose an unused semantic version and run `bun run version:bump X.Y.Z`.
3. Run frozen install, formatting, lint, type checks, frontend/Rust tests, both production builds, `bun audit`, `cargo audit`, `cargo deny`, CodeQL, secret scan, and version consistency.
4. Validate Tauri packaging on Linux x86_64, macOS arm64, and Windows x86_64. Do not advertise formats the matrix did not produce.
5. Confirm signing/notarization configuration. Unsigned artifacts must be clearly identified; never expose signing secrets to pull requests.
6. Review generated CycloneDX SBOMs and SHA-256 checksums, artifact names, and provenance attestations.
7. Merge through normal branch protection; do not bypass required review or checks.
8. Create annotated tag `vX.Y.Z` at the validated commit and push it. The release workflow rejects mismatched tags/versions.
9. Confirm all matrix jobs and the final publish job pass before the release becomes non-draft/non-prerelease/Latest.
10. Confirm GitHub Pages deploys from the same tag/version, displays the version, and that download links and every checksum resolve.
11. Record the tag/commit, workflow URLs, artifacts, and any unsigned/notarization limitations in the release notes.
12. Verify a clean working tree from the tagged commit.

Repository administrators should also verify GitHub **Settings → Code security and analysis** keeps private vulnerability reporting, Dependabot alerts/security updates, secret scanning, and push protection enabled where the repository plan supports them.

## Mobile release (iOS)

Prerequisites: Apple Developer Program membership, a physical iPhone
registered as a test device, `eas login`.

1. `bash scripts/build-ios-rust.sh` output is current (or let the EAS
   pre-install hook build it) and the Mobile bridge workflow is green on the
   release commit — it is the authoritative Rust->Swift gate.
2. Development build on a PHYSICAL device: `eas build --profile development`
   (Face ID and Keychain access control behave differently on simulators).
   Run the in-app vault self-test (dev menu → Vault self-test) and require
   "OK": every golden vector byte-exact through Swift->Rust plus a Keychain
   round trip behind the biometric prompt. Measure Argon2id (64 MiB) wall
   time during a YHP2 import; a problem is a finding to raise, never a
   parameter to lower.
3. Device walkthrough: add/view/copy/delete token; background the app and
   confirm the lock engages (zero grace); cancel Face ID and confirm a typed
   error with no partial state; biometric re-enrollment invalidates the vault
   (recovery via YHP2 documented in-app).
4. Flagship acceptance: desktop → iPhone YHP2 round trip AND iPhone →
   desktop, including a desktop vault migrated from the legacy format —
   identical token sets, working codes.
5. Production build: `eas build --profile production` then
   `eas submit -p ios` (manual, from a trusted machine — no store
   credentials in CI).
6. Inspect the built IPA from the EAS artifacts page: the YhtuaVaultPrivacy
   bundle (PrivacyInfo.xcprivacy) must be present, and `expo-updates` must be
   ABSENT and `updates.enabled` false — no-OTA is a security commitment.
   Confirm the mock vault is unreachable (EXPO_PUBLIC_USE_MOCK_VAULT=false
   in the production profile; release builds fail closed without the native
   module).
7. Export compliance: the app uses standard encryption (AES-GCM, Argon2id
   via ring/RustCrypto) solely to protect the user's own data — exempt under
   the mass-market/self-classification provisions; answer the App Store
   Connect encryption questions accordingly and keep the France import note
   in mind. `ITSAppUsesNonExemptEncryption` stays declared in app.json when
   Apple's current guidance requires it; re-verify at each submission.
8. App privacy: no data collected, no tracking; Face ID usage string
   explains vault unlocking only.
