import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { clearOwnedClipboard, clipboardFingerprint, type DigestFn } from '../src'

const digest: DigestFn = async (data) =>
  new Uint8Array(await webcrypto.subtle.digest('SHA-256', data as BufferSource))

describe('clipboard ownership clearing', () => {
  it('clears the exact value written by Yhtua', async () => {
    const write = vi.fn(async () => undefined)
    const owned = await clipboardFingerprint('123456', digest)
    await expect(clearOwnedClipboard(owned, async () => '123456', write, digest)).resolves.toBe(
      true,
    )
    expect(write).toHaveBeenCalledWith('')
  })

  it('does not overwrite a newer unrelated clipboard value', async () => {
    const write = vi.fn(async () => undefined)
    const owned = await clipboardFingerprint('123456', digest)
    await expect(clearOwnedClipboard(owned, async () => 'new value', write, digest)).resolves.toBe(
      false,
    )
    expect(write).not.toHaveBeenCalled()
  })

  it('identifies the clipboard without retaining the code', async () => {
    const fingerprint = await clipboardFingerprint('123456', digest)
    expect(fingerprint).not.toContain('123456')
    expect(fingerprint).toBe(await clipboardFingerprint('123456', digest))
    expect(fingerprint).not.toBe(await clipboardFingerprint('123457', digest))
  })
})
