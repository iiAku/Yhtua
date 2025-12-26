import * as OTPAuth from "otpauth"
import { decryptSecret, encryptSecret } from './useCrypto'

export const getRemainingTime = (period: number = 30) =>
    period - (Math.floor(Date.now() / 1000) % period)

export const getToken = async ({ issuer, label, algorithm, digits, period, secret, encrypted = false }: {
    issuer: string,
    label: string,
    algorithm: string,
    digits: number,
    period: number,
    secret: string,
    encrypted?: boolean
}): Promise<{
    value: string,
    remainingTime: number
}> => {
    const MAX_RETRIES = 5

    const plaintextSecret = encrypted
        ? await decryptSecret(secret)
        : secret

    const totp = new OTPAuth.TOTP({
        issuer,
        label,
        algorithm,
        digits,
        period,
        secret: OTPAuth.Secret.fromBase32(plaintextSecret.toUpperCase())
    })

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const value = totp.generate()
        const delta = totp.validate({ token: value, window: 1 })

        if (delta !== null) {
            return { value, remainingTime: getRemainingTime(period) }
        }

        await useSleep(attempt * 50)
    }

    throw new Error('Failed to generate valid token after retries')
}

const randomId = () =>
    Date.now().toString(36) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

export const createNewToken = async (secret: string, label: string, digits: number): Promise<Token> => ({
    id: randomId(),
    otp: {
        issuer: 'issuer',
        label,
        algorithm: "SHA1",
        digits,
        period: 30,
        secret: await encryptSecret(secret),
        encrypted: true
    }
})

export const createNewTokenPlaintext = (secret: string, label: string, digits: number): Token => ({
    id: randomId(),
    otp: {
        issuer: 'issuer',
        label,
        algorithm: "SHA1",
        digits,
        period: 30,
        secret,
        encrypted: false
    }
})
