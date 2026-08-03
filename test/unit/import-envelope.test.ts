import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const MAX_ENCRYPTED_BACKUP_BYTES = 24 * 1024 * 1024

// Mirrors the envelope schemas in app/composables/useSettings.ts and
// app/composables/useSync.ts. Neither is .strict(): backups written before 2.7.1
// carry a vestigial `hmac` key, and rejecting a file over a key we no longer read
// made real backups — including the live sync file — permanently unreadable.
const importEnvelopeSchema = z.object({
  version: z.string().max(32).optional(),
  encrypted: z.literal(true),
  syncedAt: z.number().int().nonnegative().optional(),
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

const syncBackupSchema = z.object({
  version: z.enum(['2.2.0', '2.3.0']),
  encrypted: z.literal(true),
  syncedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

const data = 'WUhQMgAAAA==ciphertext'
// The shape of a real pre-2.7.1 sync backup.
const legacySyncBackup = {
  version: '2.2.0',
  encrypted: true,
  syncedAt: 1782766151053,
  data,
  hmac: 'x'.repeat(44),
}

describe('encrypted backup envelopes', () => {
  it('reads a pre-2.7.1 sync backup and drops its vestigial hmac', () => {
    const parsed = syncBackupSchema.parse(legacySyncBackup)
    expect(parsed).not.toHaveProperty('hmac')
    expect(parsed.data).toBe(data)
    expect(importEnvelopeSchema.parse(legacySyncBackup)).not.toHaveProperty('hmac')
  })

  it('routes every encrypted-looking file to decryption', () => {
    const envelopes = [
      { version: '2.1.0', encrypted: true, data },
      { version: '2.3.0', encrypted: true, syncedAt: 1, data },
      { version: '9.9.9', encrypted: true, data },
      { encrypted: true, data },
      legacySyncBackup,
    ]

    for (const envelope of envelopes) {
      expect(importEnvelopeSchema.safeParse(envelope).success).toBe(true)
    }
  })

  it('does not claim plaintext or malformed files', () => {
    const notEncrypted = [
      { version: '2.0.0', encrypted: false, tokens: [] },
      { version: '2.0.0', tokens: [] },
      { encrypted: true },
      { encrypted: true, data: '' },
    ]

    for (const payload of notEncrypted) {
      expect(importEnvelopeSchema.safeParse(payload).success).toBe(false)
    }
  })

  it('still rejects a sync backup whose acted-on fields are wrong', () => {
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, version: '1.0' }).success).toBe(false)
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, syncedAt: -1 }).success).toBe(false)
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, data: '' }).success).toBe(false)
  })
})
