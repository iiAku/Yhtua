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
export const useTotpCode = (
  token: Token,
): { code: string | null; remaining: number; error: string | null; retry: () => void } => {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [remaining, setRemaining] = useState(getRemainingTime(token.otp.period))

  useEffect(() => {
    let cancelled = false
    // The step a DISPLAYED code belongs to. Advanced only once a code for it
    // is actually installed: marking it early would both leave the previous
    // step's code on screen while a decrypt is pending, and — if that decrypt
    // fails — suppress a deliberate retry.
    setCode(null)
    setError(null)
    let failed = false
    let shownStep = -1
    let inFlight = false

    const refresh = () => {
      if (inFlight || failed) return
      const step = currentTimeStep(token.otp.period)
      inFlight = true
      void generateCode(token)
        .then((value) => {
          inFlight = false
          if (cancelled) return
          // A decrypt that resolved after the counter moved on is stale.
          if (currentTimeStep(token.otp.period) !== step) {
            setCode(null)
            return
          }
          setError(null)
          shownStep = step
          setCode(value)
        })
        .catch(() => {
          inFlight = false
          failed = true
          if (!cancelled) {
            setCode(null)
            setError(
              'Unable to generate this code. Unlock again, or restore the token from a backup if its key is unavailable.',
            )
          }
        })
    }

    refresh()
    const interval = setInterval(() => {
      if (cancelled) return
      setRemaining(getRemainingTime(token.otp.period))
      if (currentTimeStep(token.otp.period) !== shownStep) {
        // The displayed code belongs to a step that has passed: stop showing
        // it before the replacement arrives.
        setCode(null)
        refresh()
      }
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, attempt])

  return { code, remaining, error, retry: () => setAttempt((value) => value + 1) }
}

/** Grouped for readability; a pending code reads as placeholder dots. */
export const formatCode = (code: string | null): string =>
  code === null ? '••••••' : code.replace(/(\d{3})(?=\d)/g, '$1 ')
