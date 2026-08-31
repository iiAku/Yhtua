import {
  evaluateLockScenario,
  evaluateMergeScenario,
  classifyImportPayload,
  importPolicyScenarios,
  lockScenarios,
  mergeScenarios,
} from '@yhtua/domain'
import * as OTPAuth from 'otpauth'
import { describe, expect, it } from 'vitest'

// Mobile-side execution of the shared conformance scenarios. The pure domain
// paths run here under node; the on-device adapter joins in the feature phase
// with the same fixtures. Divergence from the desktop client is a test
// failure, not a review catch.

describe('conformance (mobile): merge scenarios', () => {
  it.each(mergeScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(evaluateMergeScenario(scenario)).toEqual(scenario.expected)
    },
  )
})

describe('conformance (mobile): import policy scenarios', () => {
  it.each(importPolicyScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(classifyImportPayload(scenario.payload)).toBe(scenario.expected)
    },
  )
})

describe('conformance (mobile): lock scenarios', () => {
  it.each(lockScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      const result = evaluateLockScenario(scenario)
      expect(result.state).toBe(scenario.expectedState)
      expect(result.effects).toEqual(scenario.expectedEffects)
    },
  )
})

describe('conformance (mobile): RFC 6238 TOTP', () => {
  it('generates the SHA-1 reference vector with the same library and parameters as the app', () => {
    // gitleaks:allow — public RFC 6238 test secret.
    const totp = new OTPAuth.TOTP({
      issuer: '',
      label: 'rfc',
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      secret: OTPAuth.Secret.fromBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
    })
    expect(totp.generate({ timestamp: 59_000 })).toBe('94287082')
  })
})

describe('mobile mock crypto port', () => {
  it('refuses non-fixture secrets and real ciphertext', async () => {
    const { createMockCryptoPort } = await import('../src/ports/crypto.mock')
    const memory = new Map<string, string>()
    const port = createMockCryptoPort({
      getItem: async (name) => memory.get(name) ?? null,
      setItem: async (name, value) => {
        memory.set(name, value)
      },
      removeItem: async (name) => {
        memory.delete(name)
      },
    })
    await expect(port.encryptSecret('REALSECRETVALUE234')).rejects.toThrow(/fixture/)
    await expect(port.decryptSecret('WUhMMiQk...')).rejects.toThrow(/real ciphertext/)
    const ciphertext = await port.encryptSecret('JBSWY3DPEHPK3PXP')
    expect(ciphertext.startsWith('MOCK-')).toBe(true)
    await expect(port.decryptSecret(ciphertext)).resolves.toBe('JBSWY3DPEHPK3PXP')
  })
})
