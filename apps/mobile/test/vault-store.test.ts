import { describe, expect, it, vi } from 'vitest'

// In-memory AsyncStorage so the store module hydrates deterministically.
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

import type { Token } from '@yhtua/domain'
import { createMockCryptoPort } from '../src/ports/crypto.mock'
import { storagePort } from '../src/ports/storage'
import {
  addToken,
  updateToken,
  destroyVaultStorage,
  parseAtRestToken,
  ensureVaultHydrated,
  vaultStore,
} from '../src/state/vault-store'

const ciphertextToken = (id: string): Token => ({
  id,
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
})

describe('mobile vault store at-rest invariant', () => {
  it('rejects plaintext tokens in every mutation', async () => {
    await ensureVaultHydrated()
    const plaintext: Token = {
      ...ciphertextToken('plain-1'),
      otp: { ...ciphertextToken('plain-1').otp, secret: 'JBSWY3DPEHPK3PXP', encrypted: false },
    }
    expect(addToken(plaintext)).toBe(false)
    expect(parseAtRestToken(plaintext)).toBeNull()
    expect(addToken(ciphertextToken('cipher-1'))).toBe(true)
  })

  it('drops plaintext tokens during hydration merges', async () => {
    await ensureVaultHydrated()
    const merged = vaultStore.persist.getOptions().merge?.(
      {
        version: 2,
        tokens: [
          ciphertextToken('kept'),
          {
            ...ciphertextToken('dropped'),
            otp: {
              ...ciphertextToken('dropped').otp,
              secret: 'JBSWY3DPEHPK3PXP',
              encrypted: false,
            },
          },
        ],
        tombstones: [],
      },
      vaultStore.getState(),
    )
    expect(merged?.tokens.map(({ id }) => id)).toEqual(['kept'])
  })

  it('destroys the vault durably before the machine is notified', async () => {
    await ensureVaultHydrated()
    addToken(ciphertextToken('doomed'))
    // Let the persist middleware write.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await destroyVaultStorage()
    expect(vaultStore.getState().tokens).toEqual([])
    expect(memory.has('yhtua')).toBe(false)
  })
})

describe('mock crypto port persistence', () => {
  it('key readiness survives a JS restart so persisted dev vaults stay unlockable', async () => {
    const first = createMockCryptoPort(storagePort)
    await first.ensureEncryptionKey()
    // A "restart": a brand-new port instance over the same storage.
    const second = createMockCryptoPort(storagePort)
    await expect(second.isEncryptionReady()).resolves.toBe(true)
  })

  it('password backup methods are disabled outright', async () => {
    const port = createMockCryptoPort(storagePort)
    await expect(port.encryptWithPassword('data', 'password')).rejects.toThrow(/not available/)
    await expect(port.decryptWithPassword('data', 'password')).rejects.toThrow(/not available/)
  })
})

describe('mobile token editing', () => {
  it('renaming a token keeps its encrypted secret and records a newer update time', async () => {
    await ensureVaultHydrated()
    const original = ciphertextToken('rename-me')
    addToken(original)

    const renamed = updateToken('rename-me', { label: 'bob@example.com' })

    expect(renamed).toBe(true)
    const stored = vaultStore.getState().tokens.find(({ id }) => id === 'rename-me')
    expect(stored?.otp.label).toBe('bob@example.com')
    expect(stored?.otp.secret).toBe(original.otp.secret)
    expect(stored?.updatedAt ?? 0).toBeGreaterThan(original.updatedAt ?? 0)
  })

  it('replacing a token secret stores the new ciphertext and refuses plaintext', async () => {
    await ensureVaultHydrated()
    addToken(ciphertextToken('rekey-me'))

    const rekeyed = updateToken('rekey-me', {
      label: 'alice@example.com',
      secret: 'MOCK-TkVXU0VDUkVU',
    })
    expect(rekeyed).toBe(true)
    expect(vaultStore.getState().tokens.find(({ id }) => id === 'rekey-me')?.otp.secret).toBe(
      'MOCK-TkVXU0VDUkVU',
    )

    expect(
      updateToken('rekey-me', { label: 'alice@example.com', secret: 'JBSWY3DPEHPK3PXP' }),
    ).toBe(false)
    expect(vaultStore.getState().tokens.find(({ id }) => id === 'rekey-me')?.otp.secret).toBe(
      'MOCK-TkVXU0VDUkVU',
    )
  })

  it('editing a token that is gone changes nothing', async () => {
    await ensureVaultHydrated()
    const before = vaultStore.getState().tokens
    expect(updateToken('never-existed', { label: 'ghost' })).toBe(false)
    expect(vaultStore.getState().tokens).toEqual(before)
  })
})
