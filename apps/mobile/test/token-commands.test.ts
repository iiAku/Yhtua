import { describe, expect, it, vi } from 'vitest'

const memory = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (name: string) => memory.get(name) ?? null,
    setItem: async (name: string, value: string) => {
      memory.set(name, value)
    },
    removeItem: async (name: string) => {
      memory.delete(name)
    },
  },
}))

// Identity is a genuine boundary: a counter makes the ids assertable and
// keeps expo-modules-core (which needs __DEV__) out of the node runner.
let nextId = 0
vi.mock('expo-crypto', () => ({ randomUUID: () => `token-${++nextId}` }))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
}))

import type { CryptoPort } from '@yhtua/domain'
import { createToken, editToken } from '../src/state/token-commands'
import { dispatch, startLockHost } from '../src/lock/host'
import { __setCryptoPortForTesting } from '../src/ports'
import { ensureVaultHydrated, vaultStore } from '../src/state/vault-store'

// Encryption is a native round trip on a device: the vault can lock while it
// is in flight. This port lets a test hold a commit open across that window.
let releaseEncryption: (() => void) | null = null
const port: CryptoPort = {
  ensureEncryptionKey: async () => true,
  isEncryptionReady: async () => true,
  resetEncryptionKey: async () => undefined,
  encryptSecret: async (plaintext) => {
    if (releaseEncryption) {
      await new Promise<void>((resolve) => {
        releaseEncryption = resolve
      })
    }
    return `MOCK-${plaintext}`
  },
  decryptSecret: async (ciphertext) => ciphertext.slice('MOCK-'.length),
  encryptWithPassword: async () => 'unused',
  decryptWithPassword: async () => 'unused',
}
__setCryptoPortForTesting(port)

const scanned = {
  issuer: 'ACME',
  label: 'alice@example.com',
  algorithm: 'SHA1' as const,
  digits: 6,
  period: 30,
  secret: 'JBSWY3DPEHPK3PXP',
}

describe('creating a token under lock authority', () => {
  it('does not write a token whose encryption finished after the vault locked', async () => {
    await ensureVaultHydrated()
    await startLockHost()
    dispatch({ type: 'VAULT_CREATED' })
    dispatch({ type: 'UNLOCK_REQUESTED' })
    dispatch({ type: 'AUTH_SUCCEEDED', attemptId: 1 })
    vaultStore.setState({ version: 2, tokens: [], tombstones: [] })

    releaseEncryption = () => undefined
    const pending = createToken(scanned)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The vault locks while the native encryption is still in flight.
    dispatch({ type: 'MANUAL_LOCK' })
    releaseEncryption?.()
    releaseEncryption = null

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'locked' })
    expect(vaultStore.getState().tokens).toEqual([])
  })

  it('does not replace a secret whose encryption finished after the vault locked', async () => {
    await ensureVaultHydrated()
    vaultStore.setState({
      version: 2,
      tokens: [
        {
          id: 'existing',
          updatedAt: 1,
          otp: {
            issuer: '',
            label: 'alice@example.com',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: 'MOCK-SkJTV1kzRFBFSFBLM1BYUA==',
            encrypted: true,
          },
        },
      ],
      tombstones: [],
    })
    dispatch({ type: 'UNLOCK_REQUESTED' })
    dispatch({ type: 'AUTH_SUCCEEDED', attemptId: 2 })

    releaseEncryption = () => undefined
    const pending = editToken('existing', { label: 'alice@example.com', secret: 'NEWSECRETAAAA' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    dispatch({ type: 'MANUAL_LOCK' })
    releaseEncryption?.()
    releaseEncryption = null

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'locked' })
    expect(vaultStore.getState().tokens[0]?.otp.secret).toBe('MOCK-SkJTV1kzRFBFSFBLM1BYUA==')
  })
})
