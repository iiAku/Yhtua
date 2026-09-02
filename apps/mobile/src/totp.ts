import { currentTimeStep, getRemainingTime, type Token } from '@yhtua/domain'
import * as OTPAuth from 'otpauth'
import { useEffect, useState } from 'react'
import { getDecryptedSecret } from './state/secret-cache'

// One owner for "what code does this token show right now", used by the list
// and by the detail screen. Refreshing is driven by the RFC 6238 counter
// rather than by the countdown reaching the full period: a late or skipped
// tick would otherwise leave the previous step's code on screen — and, worse,
// on the clipboard.

export const generateCode = async (token: Token): Promise<string> => {
  const secret = token.otp.encrypted ? await getDecryptedSecret(token.otp.secret) : token.otp.secret
  return new OTPAuth.TOTP({
    issuer: token.otp.issuer,
    label: token.otp.label,
    algorithm: token.otp.algorithm,
    digits: token.otp.digits,
    period: token.otp.period,
    secret: OTPAuth.Secret.fromBase32(secret.toUpperCase()),
  }).generate()
}

/** `code` is null until a real code exists: a placeholder must never be
 * mistaken for one, least of all by the copy button. */
export const useTotpCode = (token: Token): { code: string | null; remaining: number } => {
  const [code, setCode] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(getRemainingTime(token.otp.period))

  useEffect(() => {
    let cancelled = false
    let shownStep = -1

    const refresh = () => {
      const step = currentTimeStep(token.otp.period)
      shownStep = step
      void generateCode(token)
        .then((value) => {
          // A decrypt that resolves after the step moved on is stale.
          if (!cancelled && currentTimeStep(token.otp.period) === step) setCode(value)
        })
        .catch(() => {
          if (!cancelled) setCode(null)
        })
    }

    refresh()
    const interval = setInterval(() => {
      if (cancelled) return
      setRemaining(getRemainingTime(token.otp.period))
      if (currentTimeStep(token.otp.period) !== shownStep) refresh()
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  return { code, remaining }
}

/** Grouped for readability; a pending code reads as placeholder dots. */
export const formatCode = (code: string | null): string =>
  code === null ? '••••••' : code.replace(/(\d{3})(?=\d)/g, '$1 ')
