import { TOMBSTONE_MAX_AGE_MS, type Token, type Tombstone } from './useStore'

export type MergeInput = {
  localTokens: Token[]
  localTombstones: Tombstone[]
  remoteTokens: Token[]
  remoteTombstones: Tombstone[]
}

export type MergeResult = {
  tokens: Token[]
  tombstones: Tombstone[]
}

export const mergeTokens = (input: MergeInput): MergeResult => {
  const { localTokens, localTombstones, remoteTokens, remoteTombstones } = input
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS

  // Union tombstones by id, keep latest deletedAt, prune expired
  const tombstoneMap = new Map<string, Tombstone>()
  for (const tombstone of [...localTombstones, ...remoteTombstones]) {
    const existing = tombstoneMap.get(tombstone.id)
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      tombstoneMap.set(tombstone.id, tombstone)
    }
  }
  const tombstones = [...tombstoneMap.values()].filter((t) => t.deletedAt > cutoff)
  const tombstoneIds = new Set(tombstones.map((t) => t.id))

  // Build token maps by id
  const localById = new Map(localTokens.map((token) => [token.id, token]))
  const remoteById = new Map(remoteTokens.map((token) => [token.id, token]))

  // Collect all unique token IDs
  const allIds = new Set([...localById.keys(), ...remoteById.keys()])

  const tokens: Token[] = []
  for (const id of allIds) {
    if (tombstoneIds.has(id)) continue

    const local = localById.get(id)
    const remote = remoteById.get(id)

    if (local && !remote) {
      tokens.push(local)
    } else if (remote && !local) {
      tokens.push(remote)
    } else if (local && remote) {
      // Both have the token — keep the one with the latest updatedAt, tie → prefer remote
      tokens.push((local.updatedAt ?? 0) > (remote.updatedAt ?? 0) ? local : remote)
    }
  }

  return { tokens, tombstones }
}
