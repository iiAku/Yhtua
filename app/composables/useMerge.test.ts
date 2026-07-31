import { describe, expect, it } from 'vitest'
import { mergeTokens } from './useMerge'
import { MAX_TOKENS, type Token } from './useStore'

const makeToken = (id: string, label: string, updatedAt: number): Token => ({
  id,
  updatedAt,
  otp: {
    issuer: 'Example',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: 'JBSWY3DPEHPK3PXP',
    encrypted: false,
  },
})

describe('sync conflict merging', () => {
  it('selects the newest token and uses the remote value for an exact timestamp tie', () => {
    const local = makeToken('same', 'local', 10)
    const remote = makeToken('same', 'remote', 10)
    expect(
      mergeTokens({
        localTokens: [local],
        remoteTokens: [remote],
        localTombstones: [],
        remoteTombstones: [],
      }).tokens,
    ).toEqual([remote])

    local.updatedAt = 11
    expect(
      mergeTokens({
        localTokens: [local],
        remoteTokens: [remote],
        localTombstones: [],
        remoteTombstones: [],
      }).tokens,
    ).toEqual([local])
  })

  it('merges usage ordering independently from content-conflict timestamps', () => {
    const local = { ...makeToken('same', 'older content', 10), lastUsed: 100 }
    const remote = { ...makeToken('same', 'newer content', 20), lastUsed: 50 }
    expect(
      mergeTokens({
        localTokens: [local],
        remoteTokens: [remote],
        localTombstones: [],
        remoteTombstones: [],
      }).tokens,
    ).toEqual([{ ...remote, lastUsed: 100 }])
  })

  it('uses timestamps to resolve deletion conflicts without expiring tombstones', () => {
    const current = { id: 'deleted', deletedAt: 10 }
    const superseded = { id: 'restored', deletedAt: 10 }
    const result = mergeTokens({
      localTokens: [makeToken('deleted', 'Deleted', 1), makeToken('restored', 'Restored', 11)],
      remoteTokens: [],
      localTombstones: [current, superseded],
      remoteTombstones: [],
    })
    expect(result.tokens.map(({ id }) => id)).toEqual(['restored'])
    expect(result.tombstones).toEqual([current])
  })

  it('keeps distinct accounts even when their labels match', () => {
    const result = mergeTokens({
      localTokens: [makeToken('one', 'Same label', 1)],
      remoteTokens: [makeToken('two', 'Same label', 1)],
      localTombstones: [],
      remoteTombstones: [],
    })
    expect(result.tokens.map(({ id }) => id).sort()).toEqual(['one', 'two'])
  })

  it('refuses to create an oversized merged backup', () => {
    const local = Array.from({ length: MAX_TOKENS / 2 + 1 }, (_, index) =>
      makeToken(`local-${index}`, 'Local', 1),
    )
    const remote = Array.from({ length: MAX_TOKENS / 2 }, (_, index) =>
      makeToken(`remote-${index}`, 'Remote', 1),
    )
    expect(() =>
      mergeTokens({
        localTokens: local,
        remoteTokens: remote,
        localTombstones: [],
        remoteTombstones: [],
      }),
    ).toThrow(/safety limit/)
  })
})
