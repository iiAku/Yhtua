// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Token } from '@yhtua/domain'
vi.mock('../src/state/secret-cache', () => ({ getDecryptedSecret: vi.fn() }))
import { getDecryptedSecret } from '../src/state/secret-cache'
import { useTotpCode } from '../src/totp'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const token: Token = {
  id: 'test',
  otp: {
    issuer: '',
    label: 'Example',
    secret: 'ciphertext',
    encrypted: true,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  },
}
let root: Root | undefined
let latest: ReturnType<typeof useTotpCode>
function Probe() {
  latest = useTotpCode(token)
  return createElement('p', null, latest.code)
}
afterEach(async () => {
  await act(async () => root?.unmount())
  vi.useRealTimers()
})

describe('token code authentication lifecycle', () => {
  it('does not repeatedly prompt after authentication cancellation; explicit retry resumes code generation', async () => {
    vi.useFakeTimers()
    const decrypt = vi
      .mocked(getDecryptedSecret)
      .mockRejectedValueOnce(new Error('Authentication canceled'))
    root = createRoot(document.createElement('div'))
    await act(async () => root?.render(createElement(Probe)))
    expect(latest.code).toBeNull()
    expect(latest.error).toMatch(/Unable/)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(decrypt).toHaveBeenCalledTimes(1)
    decrypt.mockResolvedValue('JBSWY3DPEHPK3PXP')
    await act(async () => latest.retry())
    expect(latest.error).toBeNull()
    expect(latest.code).toMatch(/^\d{6}$/)
    expect(decrypt).toHaveBeenCalledTimes(2)
  })
})
