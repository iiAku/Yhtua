import * as OTPAuth from 'otpauth'
import { decryptSecret, encryptSecret } from './useCrypto'

const SECRET_CACHE_TTL_MS = 30 * 1000

type SecretCacheEntry = {
  value: string
  expiresAt: number
  timer: ReturnType<typeof setTimeout>
}

const secretCache = new Map<string, SecretCacheEntry>()

export const getCachedSecret = async (
  encryptedSecret: string,
  encrypted: boolean,
): Promise<string> => {
  if (!encrypted) return encryptedSecret

  const cached = secretCache.get(encryptedSecret)
  if (cached && Date.now() < cached.expiresAt) return cached.value
  if (cached) clearTimeout(cached.timer)

  const decrypted = await decryptSecret(encryptedSecret)
  const timer = setTimeout(() => {
    const entry = secretCache.get(encryptedSecret)
    if (entry?.value === decrypted) secretCache.delete(encryptedSecret)
  }, SECRET_CACHE_TTL_MS)
  secretCache.set(encryptedSecret, {
    value: decrypted,
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
    timer,
  })
  return decrypted
}

export const clearSecretCache = () => {
  for (const entry of secretCache.values()) clearTimeout(entry.timer)
  secretCache.clear()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearSecretCache()
  })
}

export const getRemainingTime = (period: number = 30) =>
  period - (Math.floor(Date.now() / 1000) % period)

export const getToken = async ({
  issuer,
  label,
  algorithm,
  digits,
  period,
  secret,
  encrypted = false,
}: {
  issuer: string
  label: string
  algorithm: string
  digits: number
  period: number
  secret: string
  encrypted?: boolean
}): Promise<{
  value: string
  remainingTime: number
}> => {
  const plaintextSecret = await getCachedSecret(secret, encrypted)

  const totp = new OTPAuth.TOTP({
    issuer,
    label,
    algorithm,
    digits,
    period,
    secret: OTPAuth.Secret.fromBase32(plaintextSecret.toUpperCase()),
  })

  return { value: totp.generate(), remainingTime: getRemainingTime(period) }
}

const randomId = () => crypto.randomUUID()

export const createNewToken = async (
  secret: string,
  label: string,
  digits: number,
): Promise<Token> => ({
  id: randomId(),
  updatedAt: Date.now(),
  otp: {
    issuer: 'issuer',
    label,
    algorithm: 'SHA1',
    digits,
    period: 30,
    secret: await encryptSecret(secret),
    encrypted: true,
  },
})
