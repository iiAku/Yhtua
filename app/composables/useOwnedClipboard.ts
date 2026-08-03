// Proof that the clipboard still holds what we put there, without keeping the
// code itself around. The auto-clear runs up to 30s after the copy — and now
// outlives the page — so retaining the plaintext for that whole window was the
// one bit of hygiene the timed clear gave up. A digest compares just as well.
// Falls back to the value itself where SubtleCrypto is unavailable, which keeps
// the guarantee that we only ever clear what we wrote.
export const clipboardFingerprint = async (value: string): Promise<string> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return value

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const clearOwnedClipboard = async (
  ownedFingerprint: string,
  read: () => Promise<string>,
  write: (value: string) => Promise<void>,
): Promise<boolean> => {
  const currentValue = await read()
  if ((await clipboardFingerprint(currentValue)) !== ownedFingerprint) return false
  await write('')
  return true
}
