import * as OTPAuth from 'otpauth'
import { decryptSecret, encryptSecret } from './useCrypto'

const SECRET_CACHE_TTL_MS = 30 * 1000

const secretCache = new Map<string, { value: string; expiresAt: number }>()

export const getCachedSecret = async (
  encryptedSecret: string,
  encrypted: boolean,
): Promise<string> => {
  if (!encrypted) return encryptedSecret

  const cached = secretCache.get(encryptedSecret)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  const decrypted = await decryptSecret(encryptedSecret)
  secretCache.set(encryptedSecret, {
    value: decrypted,
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
  })
  return decrypted
}

export const clearSecretCache = () => secretCache.clear()

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
  const MAX_RETRIES = 3

  const plaintextSecret = await getCachedSecret(secret, encrypted)

  const totp = new OTPAuth.TOTP({
    issuer,
    label,
    algorithm,
    digits,
    period,
    secret: OTPAuth.Secret.fromBase32(plaintextSecret.toUpperCase()),
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const value = totp.generate()
    const delta = totp.validate({ token: value, window: 1 })

    if (delta !== null) {
      return { value, remainingTime: getRemainingTime(period) }
    }

    await useSleep(attempt * 10)
  }

  throw new Error('Failed to generate valid token after retries')
}

const randomId = () => crypto.randomUUID()

export const isDuplicateSecret = (secret: string): Token | undefined =>
  getTokens().find(
    (token) => !token.otp.encrypted && token.otp.secret.toUpperCase() === secret.toUpperCase(),
  )

export const isDuplicateLabel = (label: string): Token | undefined =>
  getTokens().find((token) => token.otp.label.toLowerCase() === label.toLowerCase())

export const createNewToken = async (
  secret: string,
  label: string,
  digits: number,
): Promise<Token> => ({
  id: randomId(),
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

export const createNewTokenPlaintext = (secret: string, label: string, digits: number): Token => ({
  id: randomId(),
  otp: {
    issuer: 'issuer',
    label,
    algorithm: 'SHA1',
    digits,
    period: 30,
    secret,
    encrypted: false,
  },
})
