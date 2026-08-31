import { afterEach, describe, expect, it, vi } from 'vitest'
import { clipboardFingerprint } from './useOwnedClipboard'

describe('desktop clipboard fingerprint adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fails loudly instead of producing a plaintext fingerprint without SubtleCrypto', async () => {
    vi.stubGlobal('crypto', {})
    await expect(clipboardFingerprint('123456')).rejects.toThrow(/SubtleCrypto/)
  })

  it('produces a digest, never the raw value', async () => {
    const fingerprint = await clipboardFingerprint('123456')
    expect(fingerprint).not.toContain('123456')
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})
