// Copying a TOTP code puts a live secret on a surface other apps can read.
// iOS is the only place this can be done safely, and only natively:
// `UIPasteboard` must be told the item is device-local (never Universal
// Clipboard) and must carry an expiration the OS enforces even if this
// process is killed. `expo-clipboard` can set neither, so the clipboard is
// part of the native vault module.

export type SensitiveClipboard = {
  copy(value: string, ttlSeconds: number): Promise<boolean>
  clearOwned(): Promise<boolean>
}

/** Desktop clears an owned clipboard after 30s; mobile matches it, with the
 * OS enforcing the deadline rather than a JS timer. */
export const CLIPBOARD_CLEAR_SECONDS = 30

let injected: SensitiveClipboard | null = null
let resolved: SensitiveClipboard | null | undefined

/** Test-only injection seam; production code must never call this. */
export const __setSensitiveClipboardForTesting = (fake: SensitiveClipboard | null) => {
  injected = fake
  resolved = undefined
}

// Same fail-closed shape as the crypto port: the ABSENCE of the native
// module disables copying entirely. There is no JS fallback, because a
// plain pasteboard write cannot be expired or taken back.
const getClipboard = (): SensitiveClipboard | null => {
  if (injected) return injected
  if (resolved !== undefined) return resolved
  try {
    const { sensitiveClipboard } = require('../../modules/yhtua-vault') as {
      sensitiveClipboard: SensitiveClipboard | null
    }
    resolved = sensitiveClipboard
  } catch {
    resolved = null
  }
  return resolved
}

export const isClipboardAvailable = (): boolean => getClipboard() !== null

export const copyCode = async (code: string): Promise<boolean> => {
  const clipboard = getClipboard()
  if (!clipboard) return false
  return clipboard.copy(code, CLIPBOARD_CLEAR_SECONDS)
}

/** The lock machine's WIPE_CLIPBOARD effect. Ownership is tracked natively
 * (the pasteboard's change count), so a clipboard someone else wrote since
 * our copy is left alone — and no read is attempted, which on iOS 16+ would
 * raise a paste prompt at the exact moment the vault is locking. */
export const wipeOwnedClipboard = async (): Promise<void> => {
  const clipboard = getClipboard()
  if (!clipboard) return
  try {
    await clipboard.clearOwned()
  } catch {
    // A clipboard that cannot be cleared must not stop the vault from
    // locking; the OS expiration is the backstop.
  }
}
