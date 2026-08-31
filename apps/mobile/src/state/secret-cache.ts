import { getCryptoPort } from '../ports'

// The ONLY place decrypted secrets live in JS, and only transiently. The lock
// machine's CLEAR_SECRET_CACHE effect empties it and bumps the epoch so
// in-flight decrypts can never deliver plaintext into a locked session.

const SECRET_CACHE_TTL_MS = 30 * 1000

type Entry = { value: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }

const cache = new Map<string, Entry>()
let epoch = 0

export const getSecretEpoch = () => epoch

export const clearSecretCache = () => {
  epoch += 1
  for (const entry of cache.values()) clearTimeout(entry.timer)
  cache.clear()
}

export const getDecryptedSecret = async (ciphertext: string): Promise<string> => {
  const cached = cache.get(ciphertext)
  if (cached && Date.now() < cached.expiresAt) return cached.value
  if (cached) clearTimeout(cached.timer)

  const epochBefore = epoch
  const decrypted = await getCryptoPort().decryptSecret(ciphertext)
  if (epoch !== epochBefore) {
    throw new Error('Secret session expired during decryption')
  }
  const timer = setTimeout(() => {
    const entry = cache.get(ciphertext)
    if (entry?.value === decrypted) cache.delete(ciphertext)
  }, SECRET_CACHE_TTL_MS)
  cache.set(ciphertext, { value: decrypted, expiresAt: Date.now() + SECRET_CACHE_TTL_MS, timer })
  return decrypted
}
