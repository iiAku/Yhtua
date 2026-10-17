# Mobile readiness

Last updated: 2026-10-17. The objective remains a working iPhone version faithful to desktop, with mobile cloud-file transfers and a design ready for release. This record supplements [the mobile strategy](mobile-strategy.md) and [release checklist](release-checklist.md).

## Implemented

- Desktop palette and surfaces, gold actions, deterministic colored avatars, searchable token list, circular code timer, and consistent forms, navigation, settings, recovery, and backup screens.
- QR and manual creation, optional service name, SHA1/SHA256/SHA512, 6–8 digits and 15–300-second periods, rename, secret replacement, and deletion records.
- Encrypted backup import directly into a fresh installation; first-vault writes refuse a backgrounded commit. Imports compare the outer backup metadata with authenticated contents and commit only complete encrypted results.
- Native import encryption batches all accounts under one Keychain authorization, matching the existing export decryption batch. Cancelled native authorization is never retried per account.
- Cloud-file selection through the system document picker and saving through the share sheet; provider instructions for iCloud Drive, Google Drive and kDrive. Selected cache copies and generated export files are removed after use, including failures.
- Explicit retry after code-generation authentication errors, backup-password confirmation, destructive-action confirmations, a recovery route from the lock screen, and manual entry after camera denial.
- Desktop branding replaces the starter Expo assets. Dark appearance is explicit. iOS is the native release target; browser support exists for development previews.
- CI and the native bridge workflow run for `mobile` pushes. CI includes a real-screen browser walkthrough, screenshots, and an iOS JavaScript bundle. The bridge workflow also supports manual dispatch.

## Evidence and remaining verification

| Requirement                                         | Evidence boundary                                                                               | Status                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Desktop visual fidelity                             | Shared desktop-derived palette; actual-screen screenshots at 320/390/430px                      | Browser walkthrough passed; physical safe areas and Dynamic Type still to check |
| Core token flows                                    | `scripts/mobile-ui-smoke.mjs`, command tests, shared RFC/conformance tests                      | Locally passing                                                                 |
| Safe import/export and merge                        | Transfer policy and file-adapter tests, shared merge tests                                      | Locally passing; real desktop↔iPhone round trip remains                         |
| No repeated auth after cancellation                 | Hook test advances a minute after a rejected decrypt, then explicitly retries                   | Locally passing                                                                 |
| One authorization per multi-token import            | Native batch implementation; policy test observes one batch and no fallback on cancellation     | Device prompt count and current Swift compilation remain to verify              |
| Compatible mobile dependencies                      | Frozen install, mobile typecheck, Expo Doctor                                                   | Locally passing; native build still required                                    |
| Installable native app                              | `Mobile bridge` workflow: real Swift→Rust vectors, Release simulator build and launch           | Must pass for this revision                                                     |
| iCloud / Google Drive / kDrive                      | Real Files/share-sheet operations, online and offline                                           | Physical iPhone acceptance required for each provider                           |
| Keychain / Face ID / clipboard / app-switcher cover | Native device self-test and lifecycle matrix in release checklist                               | Physical iPhone acceptance required                                             |
| TestFlight / store preparation                      | Signed production artifact, privacy manifest, no-OTA inspection, store metadata and screenshots | Still open                                                                      |

## Before calling this ready

1. Require the native bridge and full CI gates on the exact candidate commit. The iOS JavaScript export alone is insufficient.
2. Install the current native development build on a physical iPhone. Run the self-test, biometric cancellation/re-enrollment, app-switcher, clipboard expiry, camera denial, keyboard, safe-area, and enlarged-text checks from the release checklist.
3. Test both backup directions with desktop, including a multi-token restore, deletion/rename conflicts, a wrong password, file-picker cancellation, each named cloud provider, and an offline provider. Verify a failed import leaves the vault unchanged and native import raises one biometric checkpoint.
4. Produce the signed production candidate and inspect the IPA. Finish store privacy/support content and capture real device screenshots, then complete the remaining release checklist. Do not claim App Store or cloud-provider acceptance from synthetic browser evidence.

No physical-device result, signing result, or store-submission result is recorded here without evidence. Work stays active until these requirements are met.
