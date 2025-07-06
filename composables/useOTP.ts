import * as OTPAuth from "otpauth"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getRemainingTime = (period: number = 30) => {
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
    const totp = new OTPAuth.TOTP({ issuer, label, algorithm, digits, period, secret: OTPAuth.Secret.fromBase32(secret.toUpperCase()) })
    let i = 0
    const MAX_RETRIES = 5
    let delta = null

    const token = {
        value: '',
        remainingTime: 0
    }

    do {
        token.value = totp.generate()
        delta = totp.validate({ token: token.value, window: 1 })
        i++
        await sleep(i * 50)
    } while (delta === null && i <= MAX_RETRIES)
    //TODO: handle that front wise
    if (delta === null) throw new Error('Failed to generate token')
    token.remainingTime = getRemainingTime(period)
    return token

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

