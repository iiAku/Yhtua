import {
  clearOwnedClipboard as clearOwnedClipboardWith,
  clipboardFingerprint as clipboardFingerprintWith,
  type DigestFn,
} from '@yhtua/domain'

// The domain logic requires an injected digest so no platform can silently
// fall back to retaining the raw code. The desktop WebView always provides
// SubtleCrypto; failing loudly here is preferable to a plaintext fingerprint.
const digest: DigestFn = async (data) => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SubtleCrypto is unavailable; refusing a plaintext fingerprint')
  return new Uint8Array(await subtle.digest('SHA-256', data as BufferSource))
}

export const clipboardFingerprint = (value: string): Promise<string> =>
  clipboardFingerprintWith(value, digest)

export const clearOwnedClipboard = (
  ownedFingerprint: string,
  read: () => Promise<string>,
  write: (value: string) => Promise<void>,
): Promise<boolean> => clearOwnedClipboardWith(ownedFingerprint, read, write, digest)
