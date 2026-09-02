import { describe, expect, it } from 'vitest'
import { parseOtpauthUri } from '../src/otpauth-uri'

describe('otpauth URI scanning', () => {
  it('reads every token field a provider encodes in its QR code', () => {
    const parsed = parseOtpauthUri(
      'otpauth://totp/ACME%20Co:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60',
    )

    expect(parsed).toEqual({
      issuer: 'ACME Co',
      label: 'alice@example.com',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      secret: 'JBSWY3DPEHPK3PXP',
    })
  })

  it.each([
    ['not a URI at all', 'https://example.com/pay-me'],
    ['a counter-based HOTP code', 'otpauth://hotp/alice?secret=JBSWY3DPEHPK3PXP&counter=1'],
    ['a period Yhtua cannot store', 'otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP&period=1'],
    ['a digit count Yhtua cannot store', 'otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP&digits=10'],
    ['a secret that is not Base32', 'otpauth://totp/alice?secret=not-base32!!'],
  ])('rejects %s', (_case, uri) => {
    expect(parseOtpauthUri(uri)).toBeNull()
  })
})
