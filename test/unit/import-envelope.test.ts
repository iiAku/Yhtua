import { encryptedEnvelopeSchema, syncBackupSchema } from '@yhtua/domain'
import { describe, expect, it } from 'vitest'

// These import the REAL schemas from @yhtua/domain — previously this file
// carried copies because the composables could not be imported outside Nuxt.

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
    expect(encryptedEnvelopeSchema.parse(legacySyncBackup)).not.toHaveProperty('hmac')
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
      expect(encryptedEnvelopeSchema.safeParse(envelope).success).toBe(true)
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
      expect(encryptedEnvelopeSchema.safeParse(payload).success).toBe(false)
    }
  })

  it('still rejects a sync backup whose acted-on fields are wrong', () => {
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, version: '1.0' }).success).toBe(false)
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, syncedAt: -1 }).success).toBe(false)
    expect(syncBackupSchema.safeParse({ ...legacySyncBackup, data: '' }).success).toBe(false)
  })
})
