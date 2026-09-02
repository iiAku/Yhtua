import { otpParametersSchema } from '@yhtua/domain'
import * as OTPAuth from 'otpauth'

// The QR codes providers print are `otpauth://` URIs (Key Uri Format). The
// otpauth library owns the parsing; this module decides which of those URIs
// Yhtua accepts. A camera is an untrusted input channel, so the result is
// validated against the SAME schema the vault enforces at rest rather than a
// second, looser copy of those rules — and a URI Yhtua cannot store is
// rejected at the scan, where the user can still see which QR failed.

export type ScannedToken = {
  issuer: string
  label: string
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  digits: number
  period: number
  secret: string
}

export const parseOtpauthUri = (uri: string): ScannedToken | null => {
  let parsed: OTPAuth.TOTP | OTPAuth.HOTP
  try {
    parsed = OTPAuth.URI.parse(uri)
  } catch {
    return null
  }
  // HOTP is counter-based: it has no period and Yhtua does not store it.
  if (!(parsed instanceof OTPAuth.TOTP)) return null

  const candidate = otpParametersSchema.safeParse({
    issuer: parsed.issuer,
    label: parsed.label,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    period: parsed.period,
    secret: parsed.secret.base32,
    encrypted: false,
  })
  if (!candidate.success) return null
  const { issuer, label, algorithm, digits, period, secret } = candidate.data
  return { issuer, label, algorithm, digits, period, secret }
}
