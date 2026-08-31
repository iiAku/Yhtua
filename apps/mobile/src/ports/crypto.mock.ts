import type { CryptoPort, StoragePort } from '@yhtua/domain'

// Development-only crypto port for Expo Go, where no native module exists.
// It refuses anything that is not part of the synthetic fixture vault and
// returns loudly fake data, so it can never silently process a real secret.
// Password-based backup methods are DISABLED outright — YHP2 lives in Rust
// only, and a mock that accepted arbitrary plaintext would be a laundering
// path for real data. Production builds must never reach this module:
// src/ports/index.ts fails closed when the native module is absent outside
// __DEV__.

const MOCK_PREFIX = 'MOCK-'
const KEY_FLAG = 'yhtua-mock-key-ready'

// RFC 6238 test secret — public, synthetic, gitleaks-known.
const FIXTURE_SECRETS = new Set(['JBSWY3DPEHPK3PXP'])

const assertFixture = (plaintext: string) => {
  if (!FIXTURE_SECRETS.has(plaintext)) {
    throw new Error('Mock vault refuses non-fixture secrets — use the synthetic dev vault only')
  }
}

/** Key readiness persists through the injected KV so a persisted synthetic
 * vault stays unlockable across JS restarts in development. */
export const createMockCryptoPort = (kv: StoragePort): CryptoPort => ({
  ensureEncryptionKey: async () => {
    const existing = await kv.getItem(KEY_FLAG)
    if (existing === '1') return false
    await kv.setItem(KEY_FLAG, '1')
    return true
  },
  isEncryptionReady: async () => (await kv.getItem(KEY_FLAG)) === '1',
  resetEncryptionKey: async () => {
    await kv.setItem(KEY_FLAG, '1')
  },
  encryptSecret: async (plaintext) => {
    assertFixture(plaintext)
    return `${MOCK_PREFIX}${btoa(plaintext)}`
  },
  decryptSecret: async (ciphertext) => {
    if (!ciphertext.startsWith(MOCK_PREFIX)) {
      throw new Error('Mock vault cannot decrypt real ciphertext')
    }
    const plaintext = atob(ciphertext.slice(MOCK_PREFIX.length))
    assertFixture(plaintext)
    return plaintext
  },
  encryptWithPassword: async () => {
    throw new Error('Password backups are not available in the mock vault')
  },
  decryptWithPassword: async () => {
    throw new Error('Password backups are not available in the mock vault')
  },
})
