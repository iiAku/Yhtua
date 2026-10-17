import { describe, expect, it, vi } from 'vitest'

const nativeBatch = vi.hoisted(() => ({
  encrypt: vi.fn<() => Promise<string[]> | null>(() => null),
}))
vi.mock('../modules/yhtua-vault', () => ({
  encryptSecretsBatch: nativeBatch.encrypt,
  decryptSecretsBatch: () => null,
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  },
}))

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

import type { CryptoPort } from '@yhtua/domain'
import { dispatch, getLockState, startLockHost } from '../src/lock/host'
import { __setCryptoPortForTesting } from '../src/ports'
import { exportBackupContent, importBackupContent } from '../src/transfer'
import { ensureVaultHydrated, vaultStore } from '../src/state/vault-store'

// Test-only fake port: reversible encodings so the POLICY flow (routing,
// merging, at-rest enforcement, error surfaces) is testable under node. The
// cryptography itself is pinned by the Rust golden vectors, not here.
const fakePort: CryptoPort = {
  ensureEncryptionKey: async () => false,
  isEncryptionReady: async () => true,
  resetEncryptionKey: async () => undefined,
  encryptSecret: async (plaintext) => `MOCK-${plaintext}`,
  decryptSecret: async (ciphertext) => {
    if (!ciphertext.startsWith('MOCK-')) throw new Error('bad ciphertext')
    return ciphertext.slice('MOCK-'.length)
  },
  encryptWithPassword: async (plaintext, password) => `PW[${password}]${plaintext}`,
  decryptWithPassword: async (ciphertext, password) => {
    const prefix = `PW[${password}]`
    if (!ciphertext.startsWith(prefix)) throw new Error('wrong password')
    return ciphertext.slice(prefix.length)
  },
}

__setCryptoPortForTesting(fakePort)

// Transfers require an unlocked vault: drive the real host to unlocked once.
const unlockForTests = async () => {
  await startLockHost()
  dispatch({ type: 'VAULT_CREATED' })
  dispatch({ type: 'UNLOCK_REQUESTED' })
}

describe('mobile YHP2 transfer policy', () => {
  it('refuses transfers while the vault is not unlocked', async () => {
    const locked = await importBackupContent('{}', 'irrelevant')
    expect(locked.success).toBe(false)
    expect(locked.error).toMatch(/Unlock the vault/)
    await expect(exportBackupContent('irrelevant')).rejects.toThrow(/Unlock the vault/)
  })

  it('restores a desktop backup directly into a fresh install and engages locking', async () => {
    await ensureVaultHydrated()
    await startLockHost()
    expect(getLockState()).toBe('uninitialized')
    const payload = JSON.stringify({
      version: '2.3.0',
      encrypted: false,
      tokens: [{ id: 'desktop', otp: { label: 'Desktop account', secret: 'JBSWY3DPEHPK3PXP' } }],
    })
    const envelope = JSON.stringify({
      version: '2.3.0',
      encrypted: true,
      data: `PW[restore password]${payload}`,
    })
    expect(await importBackupContent(envelope, 'wrong password')).toMatchObject({ success: false })
    expect(getLockState()).toBe('uninitialized')
    expect(vaultStore.getState().tokens).toEqual([])

    expect(await importBackupContent(envelope, 'restore password')).toMatchObject({
      success: true,
      tokensCount: 1,
    })
    expect(vaultStore.getState().tokens[0]?.otp.secret).toBe('MOCK-JBSWY3DPEHPK3PXP')
    expect(getLockState()).toBe('unlocked')
    dispatch({ type: 'MANUAL_LOCK' })
    expect(getLockState()).toBe('locked')
    expect(await importBackupContent(envelope, 'restore password')).toMatchObject({
      success: false,
    })
    dispatch({ type: 'UNLOCK_REQUESTED' })
    dispatch({ type: 'AUTH_SUCCEEDED', attemptId: 1 })
  })

  it('does not restore a first vault if the app backgrounds during decryption', async () => {
    dispatch({ type: 'VAULT_DESTROYED' })
    vaultStore.setState({ version: 2, tokens: [], tombstones: [] })
    const decrypt = vi.fn(async () => {
      dispatch({ type: 'APP_BACKGROUNDED' })
      return JSON.stringify({ version: '2.3.0', tokens: [], tombstones: [] })
    })
    __setCryptoPortForTesting({ ...fakePort, decryptWithPassword: decrypt })
    try {
      const result = await importBackupContent(
        JSON.stringify({ version: '2.3.0', encrypted: true, data: 'encrypted' }),
        'password',
      )
      expect(result).toMatchObject({ success: false })
      expect(getLockState()).toBe('uninitialized')
      expect(vaultStore.getState().tokens).toEqual([])
    } finally {
      __setCryptoPortForTesting(fakePort)
      dispatch({ type: 'APP_FOREGROUNDED', elapsedMs: 10 })
    }
  })

  it('round-trips an encrypted backup and lands only ciphertext at rest', async () => {
    await ensureVaultHydrated()
    await unlockForTests()
    vaultStore.setState({
      version: 2,
      tokens: [
        {
          id: 'exported-1',
          updatedAt: 5,
          otp: {
            issuer: '',
            label: 'alice@example.com',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: 'MOCK-JBSWY3DPEHPK3PXP',
            encrypted: true,
          },
        },
      ],
      tombstones: [],
    })

    const exported = await exportBackupContent('correct horse battery')
    const envelope = JSON.parse(exported) as { encrypted: boolean; data: string }
    expect(envelope.encrypted).toBe(true)
    // NOTE: the fake port is transparent, so plaintext opacity cannot be
    // asserted here — real ciphertext opacity is pinned by the Rust golden
    // vectors and the on-device self-test.

    vaultStore.setState({ version: 2, tokens: [], tombstones: [] })
    const result = await importBackupContent(exported, 'correct horse battery')
    expect(result.success).toBe(true)
    expect(result.tokensCount).toBe(1)
    const stored = vaultStore.getState().tokens[0]
    expect(stored?.otp.encrypted).toBe(true)
    expect(stored?.otp.secret).toBe('MOCK-JBSWY3DPEHPK3PXP')
  })

  it('rejects a wrong password without touching the vault', async () => {
    await ensureVaultHydrated()
    const exported = await exportBackupContent('correct horse battery')
    const before = vaultStore.getState().tokens
    const result = await importBackupContent(exported, 'wrong password!')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Wrong password/)
    expect(vaultStore.getState().tokens).toEqual(before)
  })

  it('imports a multi-token backup through one native authorization and aborts on cancellation', async () => {
    const payload = JSON.stringify({
      version: '2.3.0',
      tokens: [
        { id: 'batch-1', otp: { label: 'One', secret: 'JBSWY3DPEHPK3PXP' } },
        { id: 'batch-2', otp: { label: 'Two', secret: 'JBSWY3DPEHPK3PXP' } },
      ],
    })
    const envelope = JSON.stringify({
      version: '2.3.0',
      encrypted: true,
      data: `PW[password]${payload}`,
    })
    const perToken = vi.fn(fakePort.encryptSecret)
    __setCryptoPortForTesting({ ...fakePort, encryptSecret: perToken })
    try {
      nativeBatch.encrypt.mockReturnValueOnce(Promise.resolve(['MOCK-one', 'MOCK-two']))
      expect(await importBackupContent(envelope, 'password')).toMatchObject({
        success: true,
        tokensCount: 2,
      })
      expect(nativeBatch.encrypt).toHaveBeenCalledWith(['JBSWY3DPEHPK3PXP', 'JBSWY3DPEHPK3PXP'])
      expect(perToken).not.toHaveBeenCalled()
      const before = vaultStore.getState().tokens
      nativeBatch.encrypt.mockImplementationOnce(() =>
        Promise.reject(new Error('Authentication canceled')),
      )
      await expect(importBackupContent(envelope, 'password')).rejects.toThrow(
        'Authentication canceled',
      )
      expect(perToken).not.toHaveBeenCalled()
      expect(vaultStore.getState().tokens).toEqual(before)
    } finally {
      __setCryptoPortForTesting(fakePort)
    }
  })

  it('rejects an incomplete native encryption batch without importing a partial backup', async () => {
    const before = vaultStore.getState().tokens
    const payload = JSON.stringify({
      version: '2.3.0',
      tokens: [{ id: 'partial', otp: { label: 'Partial', secret: 'JBSWY3DPEHPK3PXP' } }],
    })
    nativeBatch.encrypt.mockReturnValueOnce(Promise.resolve([]))
    const result = await importBackupContent(
      JSON.stringify({ version: '2.3.0', encrypted: true, data: `PW[password]${payload}` }),
      'password',
    )
    expect(result.success).toBe(false)
    expect(vaultStore.getState().tokens).toEqual(before)
  })

  it('rejects tampered outer metadata that does not match the authenticated backup', async () => {
    const payload = JSON.stringify({
      version: '2.3.0',
      tokens: [{ id: 'metadata', otp: { label: 'Metadata', secret: 'JBSWY3DPEHPK3PXP' } }],
    })
    const before = vaultStore.getState().tokens
    const result = await importBackupContent(
      JSON.stringify({ version: '2.2.0', encrypted: true, data: `PW[password]${payload}` }),
      'password',
    )
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/metadata/i) })
    expect(vaultStore.getState().tokens).toEqual(before)
  })

  it('refuses plaintext backups on mobile', async () => {
    const plaintext = JSON.stringify({
      version: '2.3.0',
      encrypted: false,
      tokens: [
        {
          id: 'plain-1',
          otp: { label: 'bob', secret: 'JBSWY3DPEHPK3PXP' },
        },
      ],
    })
    const result = await importBackupContent(plaintext, 'irrelevant')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Plaintext backups are not supported/)
  })

  it('rejects malformed files with a policy error', async () => {
    const result = await importBackupContent('{"not":"a backup"}', 'irrelevant')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid/)
  })
})
