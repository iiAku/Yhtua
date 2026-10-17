# Yhtua for iPhone

Native iOS client on the `mobile` branch. Expo / React Native screens share the desktop vault’s dark surfaces, gold accents, colored account avatars, token timer, schemas, merge policy, and encrypted backup formats. Desktop remains a separate Tauri app.

The native Expo module owns Keychain access and Rust encryption. Release builds refuse to run without it. Android is not supported yet. Web is a development preview, not a supported vault or a publish target.

## Develop

From the repository root, with Bun 1.4+, Node 22.13+ and the pinned Rust toolchain:

```sh
bun install --frozen-lockfile
bun run --cwd apps/mobile start
# Browser layout preview:
bun run --cwd apps/mobile web
```

Expo Go and the browser use a fixture-only development vault. The only accepted setup key is the public synthetic value `JBSWY3DPEHPK3PXP`. Use account names such as “Personal email” and “Work account” for previews. Real secrets, real encrypted backups, clipboard operations, and biometric behavior require the native development build. A banner identifies the fixture preview.

On macOS, `bash scripts/eas-pre-install.sh` builds the Rust XCFramework before `bun run --cwd apps/mobile ios`. For a physical iPhone, run `eas build --platform ios --profile development` from this directory after configuring Apple signing. EAS runs the same Rust hook.

## Cloud backups

1. Install your preferred provider (Google Drive or kDrive) and enable it in **Files → Browse → More → Edit**. iCloud Drive is available through Files when enabled on the phone.
2. To restore, choose **Restore a Yhtua backup** on the welcome screen, or **Backups → Import a backup**. Enter its password, then select the encrypted `.json` file. A first installation can restore directly; no temporary token is required.
3. To save, choose **Backups → Save a backup**, enter and confirm a separate backup password, then **Choose where to save**. In the share sheet, choose **Save to Files** and your provider’s folder. Check that the destination contains the new file.
4. Repeat after changes and import the new file on your other device. These are manual transfers. Desktop folder monitoring and absolute filesystem paths are omitted from mobile.

Portable backups use the desktop-compatible YHP2 format. Legacy encrypted desktop backups remain readable. Plaintext exports and another installation’s local ciphertext are refused. A restore merges tokens and deletion records instead of replacing the vault. Provider access and offline downloads require physical-device acceptance; the browser cannot prove them.

## Verify

```sh
bun run check
bun run test --project mobile
bunx playwright install chromium
bun run test:mobile:ui
cd apps/mobile
bunx expo-doctor
bunx expo export --platform ios
```

The browser smoke starts its own Expo server, exercises the actual screens using synthetic data, and writes screenshots to the system temporary directory under `yhtua-mobile-ui`. It covers creation, account/service search, code generation, rename, backup password validation, lock/unlock, custom eight-digit codes, deletion, and 320/390/430px layouts. Set `YHTUA_BROWSER_PATH` to use an existing Chromium executable, `YHTUA_MOBILE_PORT` to change its port, or `YHTUA_MOBILE_URL` to reuse a running preview server.

The [readiness record](../../docs/mobile-readiness.md) distinguishes local evidence from the [native and device release gates](../../docs/release-checklist.md). A JavaScript bundle or browser screenshot does not prove an installable iOS build, working Face ID, cloud-provider access, or App Store readiness.
