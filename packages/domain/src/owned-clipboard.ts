import type { DigestFn } from './ports'
import { utf8Encode } from './utf8'

// Proof that the clipboard still holds what we put there, without keeping the
// code itself around. The auto-clear runs up to 30s after the copy — and now
// outlives the page — so retaining the plaintext for that whole window was the
// one bit of hygiene the timed clear gave up. A digest compares just as well.
// The digest is a REQUIRED injected capability: a fallback that returned the
// raw value would silently retain the code on platforms without SubtleCrypto
// (React Native's Hermes), which is exactly the leak the digest prevents.
export const clipboardFingerprint = async (value: string, digest: DigestFn): Promise<string> => {
  const bytes = await digest(utf8Encode(value))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const clearOwnedClipboard = async (
  ownedFingerprint: string,
  read: () => Promise<string>,
  write: (value: string) => Promise<void>,
  digest: DigestFn,
): Promise<boolean> => {
  const currentValue = await read()
  if ((await clipboardFingerprint(currentValue, digest)) !== ownedFingerprint) return false
  await write('')
  return true
}
