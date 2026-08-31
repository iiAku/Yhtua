import { describe, expect, it } from 'vitest'
import {
  addTokenSchema,
  exportImportSchema,
  MAX_TOKENS,
  mergePersistedStore,
  normalizeBase32Secret,
  plaintextBackupSchema,
  portableBackupMetadataMatches,
  tokenSchema,
  type Token,
} from '../src'

const token: Token = {
  id: 'token-1',
  updatedAt: 1,
  otp: {
    issuer: 'Example',
    label: 'alice@example.com',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: 'JBSWY3DPEHPK3PXP',
    encrypted: false,
  },
}

describe('token boundary schemas', () => {
  it('normalizes human-formatted Base32 secrets', () => {
    expect(normalizeBase32Secret('jbsw y3dp-ehpk3pxp')).toBe('JBSWY3DPEHPK3PXP')
    expect(
      addTokenSchema.parse({ secret: 'jbsw y3dp-ehpk3pxp', label: ' Alice ', digits: 6 }),
    ).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      label: 'Alice',
      digits: 6,
    })
  })

  it.each(['', 'NOT-BASE32-!', 'A======', 'JBSWY3DP0HPK3PXP'])(
    'rejects malformed Base32 input: %s',
    (secret) => {
      expect(addTokenSchema.safeParse({ secret, label: 'Alice', digits: 6 }).success).toBe(false)
    },
  )

  it.each(['JBSWY3DP=', 'AB', 'ABCDEF', 'JBSWY3DP===='])(
    'rejects non-canonical Base32: %s',
    (secret) => {
      expect(addTokenSchema.safeParse({ secret, label: 'Alice', digits: 6 }).success).toBe(false)
    },
  )

  it('rejects unknown fields and unsafe algorithm parameters', () => {
    expect(tokenSchema.safeParse({ ...token, __proto_pollution: true }).success).toBe(false)
    expect(
      tokenSchema.safeParse({ ...token, otp: { ...token.otp, algorithm: 'MD5' } }).success,
    ).toBe(false)
    expect(tokenSchema.safeParse({ ...token, otp: { ...token.otp, period: 0 } }).success).toBe(
      false,
    )
  })

  it('rejects duplicate identifiers and device-bound ciphertext in portable backups', () => {
    const duplicate = { version: '2.3.0', encrypted: false, tokens: [token, token] }
    expect(exportImportSchema.safeParse(duplicate).success).toBe(false)
    const deviceBound = {
      version: '2.3.0',
      encrypted: false,
      tokens: [{ ...token, otp: { ...token.otp, encrypted: true, secret: 'ciphertext' } }],
    }
    expect(plaintextBackupSchema.safeParse(deviceBound).success).toBe(false)
    expect(
      plaintextBackupSchema.safeParse({
        version: '99.0.0',
        encrypted: false,
        tokens: [token],
      }).success,
    ).toBe(false)
    expect(
      plaintextBackupSchema.safeParse({
        version: '2.3.0',
        encrypted: false,
        tokens: [{ ...token, otp: { ...token.otp, secret: 'not base32!' } }],
      }).success,
    ).toBe(false)
  })

  it('allows ciphertext expansion without increasing the portable plaintext limit', () => {
    expect(
      tokenSchema.safeParse({
        ...token,
        otp: { ...token.otp, encrypted: true, secret: 'A'.repeat(5500) },
      }).success,
    ).toBe(true)
    expect(
      plaintextBackupSchema.safeParse({
        version: '2.3.0',
        encrypted: false,
        tokens: [{ ...token, otp: { ...token.otp, secret: 'A'.repeat(4097) } }],
      }).success,
    ).toBe(false)
  })

  it('salvages valid legacy records instead of discarding an entire persisted vault', () => {
    const salvaged = mergePersistedStore(
      {
        tokens: [token, { ...token, id: '', otp: { ...token.otp, algorithm: 'MD5' } }],
        tombstones: [
          { id: 'old-token', deletedAt: 10 },
          { id: '', deletedAt: -1 },
        ],
        ignoredLegacyField: true,
      },
      { version: 2, tokens: [], tombstones: [] },
    )
    expect(salvaged.version).toBe(1)
    expect(salvaged.tokens).toEqual([token])
    expect(salvaged.tombstones).toEqual([{ id: 'old-token', deletedAt: 10 }])
  })

  it('normalizes portable Base32 secrets before they reach import consumers', () => {
    const parsed = plaintextBackupSchema.parse({
      version: '2.3.0',
      encrypted: false,
      tokens: [{ ...token, otp: { ...token.otp, secret: 'jbsw-y3dp ehpk3pxp' } }],
    })
    expect(parsed.tokens[0]?.otp.secret).toBe('JBSWY3DPEHPK3PXP')
  })

  it('binds version and v2.3 sync timestamps to authenticated inner metadata', () => {
    expect(
      portableBackupMetadataMatches(
        { version: '2.3.0', syncedAt: 10 },
        { version: '2.3.0', syncedAt: 10 },
      ),
    ).toBe(true)
    expect(
      portableBackupMetadataMatches(
        { version: '2.3.0', syncedAt: 11 },
        { version: '2.3.0', syncedAt: 10 },
      ),
    ).toBe(false)
    expect(portableBackupMetadataMatches({ version: '2.3.0' }, { version: '2.2.0' })).toBe(false)
  })

  it('enforces the token-count limit', () => {
    const tokens = Array.from({ length: MAX_TOKENS + 1 }, (_, index) => ({
      ...token,
      id: `token-${index}`,
    }))
    expect(
      exportImportSchema.safeParse({ version: '2.3.0', encrypted: false, tokens }).success,
    ).toBe(false)
  })

  it('imports a Yhtua v1 backup shape and upgrades legacy fields', () => {
    const parsed = plaintextBackupSchema.safeParse({
      version: '1.0',
      tokens: [
        {
          id: 'legacy-1',
          otp: {
            issuer: 'issuer',
            label: 'alice@example.com',
            algorithm: 'sha-256',
            digits: 6,
            period: 30,
            secret: 'jbsw y3dp ehpk 3pxp',
          },
        },
      ],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tokens[0]?.otp).toMatchObject({
      algorithm: 'SHA256',
      secret: 'JBSWY3DPEHPK3PXP',
    })
  })

  it('drops the optional issuer from a backup without losing the token', () => {
    const parsed = plaintextBackupSchema.safeParse({
      version: '1.0',
      tokens: [{ id: 'legacy-2', otp: { label: 'bob', secret: 'JBSWY3DPEHPK3PXP' } }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tokens[0]?.otp).toMatchObject({ issuer: '', algorithm: 'SHA1' })
  })
})
