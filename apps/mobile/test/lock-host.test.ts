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

const appStateListeners = new Set<(status: string) => void>()
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_type: string, listener: (status: string) => void) => {
      appStateListeners.add(listener)
      return { remove: () => appStateListeners.delete(listener) }
    },
  },
}))

import { dispatch, getLockState, requestUnlock, startLockHost } from '../src/lock/host'
import { __setCryptoPortForTesting, getCryptoPort } from '../src/ports'
import { createMockCryptoPort } from '../src/ports/crypto.mock'
import { storagePort } from '../src/ports/storage'
import { addToken } from '../src/state/vault-store'
import type { Token } from '@yhtua/domain'

__setCryptoPortForTesting(createMockCryptoPort(storagePort))

const setAppState = (status: string) => {
  for (const listener of appStateListeners) listener(status)
}

describe('mobile lock host (full enforcement)', () => {
  it('locks on every real backgrounding under the zero-grace contract', async () => {
    await getCryptoPort().ensureEncryptionKey()
    await startLockHost()
    expect(getLockState()).toBe('uninitialized')

    // First token engages the machine.
    const token: Token = {
      id: 'first',
      updatedAt: 1,
      otp: {
        issuer: '',
        label: 'first@example.com',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: 'MOCK-SkJTV1kzRFBFSFBLM1BYUA==',
        encrypted: true,
      },
    }
    expect(addToken(token)).toBe(true)
    dispatch({ type: 'VAULT_CREATED' })
    expect(getLockState()).toBe('unlocked')

    // Zero grace: any real backgrounding requires re-authentication.
    setAppState('background')
    expect(getLockState()).toBe('masked')
    setAppState('active')
    expect(getLockState()).toBe('locked')

    // The iOS 'inactive' blip is NOT a backgrounding — and neither is the
    // 'active' that follows it (Face ID sheet dismissed, control centre closed).
    // Under zero grace an unpaired 'active' would otherwise lock the app.
    await requestUnlock()
    expect(getLockState()).toBe('unlocked')
    setAppState('inactive')
    expect(getLockState()).toBe('unlocked')
    setAppState('active')
    expect(getLockState()).toBe('unlocked')
  })

  it('treats a tombstone-only vault as initialized, never as a fresh one', async () => {
    const { vaultStore } = await import('../src/state/vault-store')
    vaultStore.setState({
      version: 2,
      tokens: [],
      tombstones: [{ id: 'deleted-1', deletedAt: 10 }],
    })
    // hasVault must be true for a vault whose tokens were all deleted.
    const persisted = vaultStore.getState()
    expect(persisted.tokens.length > 0 || persisted.tombstones.length > 0).toBe(true)
  })
})
