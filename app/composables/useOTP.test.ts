import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRemainingTime, getToken } from './useOTP'

afterEach(() => vi.useRealTimers())

describe('TOTP generation', () => {
  it('matches the RFC 6238 SHA-1 test vector at 59 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(59_000)
    const result = await getToken({
      issuer: 'RFC 6238',
      label: 'test',
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', // gitleaks:allow — public RFC 6238 test vector
    })
    expect(result).toEqual({ value: '94287082', remainingTime: 1 })
  })

  it('calculates period boundaries consistently', () => {
    vi.useFakeTimers()
    vi.setSystemTime(30_000)
    expect(getRemainingTime(30)).toBe(30)
    vi.setSystemTime(44_000)
    expect(getRemainingTime(30)).toBe(16)
  })
})
