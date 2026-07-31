# Backup formats

All examples and tests must use synthetic credentials.

## Portable JSON envelope

Version 2.3.0 exports and sync files use a strict outer JSON object:

```json
{ "version": "2.3.0", "encrypted": true, "data": "BASE64_CIPHERTEXT" }
```

Sync adds a non-secret `syncedAt` millisecond timestamp. Version 2.3 repeats the version and timestamp inside the authenticated ciphertext, and readers require both copies to match. Unknown fields, oversized strings/files, duplicate IDs, excessive token counts, invalid algorithms/digits/periods, and device-bound encrypted token payloads are rejected.

After authenticated decryption, `data` contains UTF-8 JSON with `version`, `encrypted: false`, a bounded `tokens` array, and optional bounded `syncedAt` and `tombstones` fields. Portable token secrets are plaintext only inside this authenticated, decrypted in-memory representation; the outer file contains ciphertext.

## Password ciphertext v2 (`YHP2`)

After Base64 decoding:

| Offset |    Length | Value                                      |
| -----: | --------: | ------------------------------------------ |
|      0 |         4 | ASCII `YHP2`                               |
|      4 |        16 | random salt                                |
|     20 |        12 | random AES-GCM nonce                       |
|     32 | remaining | ciphertext followed by the 16-byte GCM tag |

The 256-bit key is derived with Argon2id v1.3 using 64 MiB memory, 3 iterations, 1 lane, and a 32-byte output. AES-256-GCM authenticates the constant associated-data string `yhtua-password-backup-v2`. Salt and nonce come from the OS CSPRNG for every encryption.

## Legacy compatibility

Ciphertexts without `YHP2` are read as the pre-2.8 format: 16-byte salt, 12-byte nonce, then AES-256-GCM ciphertext/tag; the key uses PBKDF2-HMAC-SHA256 with 600,000 iterations. A legacy random salt that happens to begin with `YHP2` is also tried under the legacy layout, but is accepted only when its AES-GCM tag authenticates. New files are never written in this format. Successful import is migration by re-exporting or syncing in the new format.

Local token ciphertext uses the analogous `YHL2` marker and associated data `yhtua-local-secret-v2`; unmarked or marker-colliding legacy ciphertext remains readable for in-place upgrades only when its legacy AES-GCM tag authenticates.

Cryptographic authentication is verified before UTF-8 or JSON parsing. Wrong passwords, modified headers/tags/metadata, truncated ciphertext, and invalid UTF-8 fail closed.
