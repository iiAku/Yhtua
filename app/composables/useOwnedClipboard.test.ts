import { describe, expect, it, vi } from 'vitest'
import { clearOwnedClipboard, clipboardFingerprint } from './useOwnedClipboard'

describe('clipboard ownership clearing', () => {
  it('clears the exact value written by Yhtua', async () => {
    const write = vi.fn(async () => undefined)
    const owned = await clipboardFingerprint('123456')
    await expect(clearOwnedClipboard(owned, async () => '123456', write)).resolves.toBe(true)
    expect(write).toHaveBeenCalledWith('')
  })

  it('does not overwrite a newer unrelated clipboard value', async () => {
    const write = vi.fn(async () => undefined)
    const owned = await clipboardFingerprint('123456')
    await expect(clearOwnedClipboard(owned, async () => 'new value', write)).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('identifies the clipboard without retaining the code', async () => {
    const fingerprint = await clipboardFingerprint('123456')
    expect(fingerprint).not.toContain('123456')
    expect(fingerprint).toBe(await clipboardFingerprint('123456'))
    expect(fingerprint).not.toBe(await clipboardFingerprint('123457'))
  })
})
