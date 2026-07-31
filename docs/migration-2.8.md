# Migration to 2.8

Yhtua 2.8 is backward compatible with supported 2.x data, but it changes how new ciphertext and credentials are stored.

## Local tokens and credentials

Existing unmarked AES-GCM local ciphertext remains readable. New or updated secrets use the authenticated `YHL2` envelope. On first access, credentials under the former `yhtua` service identifier are copied to the stable `com.yhtua.dev` service and the old entry is removed only after a verified write.

Releases that used the legacy machine-derived encrypted credential file receive a one-time migration into the OS credential store. Existing OS-store values take precedence, and the file is removed only after all present values have been stored successfully. There is no new filesystem fallback: if the platform credential service is unavailable or locked, Yhtua fails closed and retries later.

If the local encryption key is permanently missing, encrypted tokens cannot be recovered without a portable backup. The in-app reset action rotates the credential-store key first and clears unreadable token state only after rotation succeeds.

## Portable backups and sync

PBKDF2/AES-GCM backup ciphertext from earlier releases remains importable. All newly exported or synchronized files use the versioned `YHP2` Argon2id/AES-256-GCM envelope and portable schema 2.3.0. Re-exporting or completing a sync writes the new format; no in-place conversion of the only backup is required.

Before upgrading multiple synchronized devices, retain a copy of the most recent valid backup and upgrade one device first. Yhtua keeps five safety copies when replacing a sync file, but cloud-provider rollback and conflict behavior remains outside the app's control.
