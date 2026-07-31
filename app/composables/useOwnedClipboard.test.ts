import { describe, expect, it, vi } from 'vitest'
import { clearOwnedClipboard } from './useOwnedClipboard'

describe('clipboard ownership clearing', () => {
  it('clears the exact value written by Yhtua', async () => {
    const write = vi.fn(async () => undefined)
    await expect(clearOwnedClipboard('123456', async () => '123456', write)).resolves.toBe(true)
    expect(write).toHaveBeenCalledWith('')
  })

  it('does not overwrite a newer unrelated clipboard value', async () => {
    const write = vi.fn(async () => undefined)
    await expect(clearOwnedClipboard('123456', async () => 'new value', write)).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})
