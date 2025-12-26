import * as OTPAuth from "otpauth"

export const getRemainingTime = (period: number = 30) => {
    const nowInSeconds = Math.floor(Date.now() / 1000)
    return period - (nowInSeconds % period)
}

export const getToken = async ({ issuer, label, algorithm, digits, period, secret }: {
    issuer: string,
    label: string,
    algorithm: string,
    digits: number,
    period: number,
    secret: string
}): Promise<{
    value: string,
    remainingTime: number
}> => {
    const MAX_RETRIES = 5

    const totp = new OTPAuth.TOTP({
        issuer,
        label,
        algorithm,
        digits,
        period,
        secret: OTPAuth.Secret.fromBase32(secret.toUpperCase())
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

const randomId = () => {
    const time = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    return time + random
}

export const createNewToken = (secret: string, label: string, digits: number) => ({
    id: randomId(),
    otp: {
        issuer: 'issuer',
        label,
        algorithm: "SHA1",
        digits,
        period: 30,
        secret
    }
} satisfies Token)
