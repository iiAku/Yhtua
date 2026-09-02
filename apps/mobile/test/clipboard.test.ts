import { describe, expect, it } from 'vitest'
import {
  __setSensitiveClipboardForTesting,
  CLIPBOARD_CLEAR_SECONDS,
  copyCode,
  wipeOwnedClipboard,
  type SensitiveClipboard,
} from '../src/clipboard'

const recordingClipboard = () => {
  const copies: Array<{ value: string; ttlSeconds: number }> = []
  let clears = 0
  const clipboard: SensitiveClipboard = {
    copy: async (value, ttlSeconds) => {
      copies.push({ value, ttlSeconds })
      return true
    },
    clearOwned: async () => {
      clears += 1
      return true
    },
  }
  return { clipboard, copies, clearCount: () => clears }
}

describe('mobile sensitive clipboard', () => {
  it('copies a code as a device-local value that expires on its own', async () => {
    const { clipboard, copies } = recordingClipboard()
    __setSensitiveClipboardForTesting(clipboard)

    await expect(copyCode('123456')).resolves.toBe(true)

    expect(copies).toEqual([{ value: '123456', ttlSeconds: CLIPBOARD_CLEAR_SECONDS }])
  })

  it('refuses to copy when the platform cannot expire or take back the value', async () => {
    __setSensitiveClipboardForTesting(null)
    await expect(copyCode('123456')).resolves.toBe(false)
  })

  it('locking asks the platform to take back a code this app copied', async () => {
    const { clipboard, clearCount } = recordingClipboard()
    __setSensitiveClipboardForTesting(clipboard)

    await copyCode('123456')
    await wipeOwnedClipboard()

    expect(clearCount()).toBe(1)
  })
})
