import { describe, expect, it } from 'vitest'
import {
  defaultStore,
  getTokens,
  mergePersistedStore,
  plaintextBackupSchema,
  store,
  storeAddToken,
  storeDeleteAllTokens,
  storeDeleteToken,
  type Token,
  updateTokenOtp,
} from './useStore'

// Pure schema and merge behavior is covered in packages/domain/test; these
// cases exercise the desktop zustand store operations around it.

const token: Token = {
  id: 'token-1',
  updatedAt: 1,
  otp: {
    issuer: 'Example',
    label: 'alice@example.com',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: 'JBSWY3DPEHPK3PXP',
    encrypted: false,
  },
}

describe('desktop token store operations', () => {
  it('keeps last-used ordering after an unrelated token update', () => {
    const newer = { ...token, id: 'newer', lastUsed: 20 }
    const older = { ...token, id: 'older', lastUsed: 10 }
    store.setState({ version: 2, tokens: [older, newer], tombstones: [] })
    expect(getTokens().map(({ id }) => id)).toEqual(['newer', 'older'])
    updateTokenOtp('older', { label: 'Updated label' })
    expect(getTokens().map(({ id }) => id)).toEqual(['newer', 'older'])
  })

  it('deletes a token and records its tombstone atomically', () => {
    store.setState({ version: 2, tokens: [token], tombstones: [] })
    storeDeleteToken(token.id)
    expect(store.getState().tokens).toEqual([])
    expect(store.getState().tombstones).toHaveLength(1)
    expect(store.getState().tombstones[0]?.id).toBe(token.id)
  })

  it('imports a Yhtua v1 backup and upgrades it to the current shape', () => {
    const legacy = {
      version: '1.0',
      tokens: [
        {
          id: 'legacy-1',
          otp: {
            issuer: 'issuer',
            label: 'alice@example.com',
            algorithm: 'sha-256',
            digits: 6,
            period: 30,
            secret: 'jbsw y3dp ehpk 3pxp',
          },
        },
      ],
    }

    const parsed = plaintextBackupSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)

    store.setState({ version: 2, tokens: [], tombstones: [] })
    expect(storeAddToken(parsed.data?.tokens ?? [])).toBe(1)
    expect(store.getState().tokens[0]?.otp).toEqual({
      issuer: 'issuer',
      label: 'alice@example.com',
      algorithm: 'SHA256',
      digits: 6,
      period: 30,
      secret: 'JBSWY3DPEHPK3PXP',
      encrypted: false,
    })
  })

  it('resurrects a deleted token on import so it survives the next load', () => {
    // Deleting everything then restoring a backup re-adds the same ids. Leaving
    // the tombstones behind made the tokens vanish on the next rehydrate.
    store.setState({ version: 2, tokens: [token], tombstones: [] })
    storeDeleteAllTokens()
    expect(store.getState().tokens).toEqual([])
    expect(store.getState().tombstones).toHaveLength(1)

    expect(storeAddToken(token)).toBe(1)
    expect(store.getState().tombstones).toEqual([])

    const rehydrated = mergePersistedStore(store.getState(), defaultStore())
    expect(rehydrated.tokens.map(({ id }) => id)).toEqual([token.id])
  })

  it('records tombstones when deleting every token so an empty vault can sync', () => {
    store.setState({
      version: 2,
      tokens: [token, { ...token, id: 'token-2' }],
      tombstones: [],
    })
    storeDeleteAllTokens()
    expect(store.getState().tokens).toEqual([])
    expect(
      store
        .getState()
        .tombstones.map(({ id }) => id)
        .sort(),
    ).toEqual(['token-1', 'token-2'])
  })
})
