import { MAX_TOKENS, type Token, type Tombstone } from './useStore'

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
  // Union tombstones by id and keep the latest deletion.
  const tombstoneMap = new Map<string, Tombstone>()
  for (const tombstone of [...localTombstones, ...remoteTombstones]) {
    const existing = tombstoneMap.get(tombstone.id)
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      tombstoneMap.set(tombstone.id, tombstone)
    }
  }
  // Build token maps by id
  const localById = new Map(localTokens.map((token) => [token.id, token]))
  const remoteById = new Map(remoteTokens.map((token) => [token.id, token]))

  // Collect all unique token IDs
  const allIds = new Set([...localById.keys(), ...remoteById.keys()])

  const tokens: Token[] = []
  for (const id of allIds) {
    const local = localById.get(id)
    const remote = remoteById.get(id)
    let selected: Token | undefined

    if (local && !remote) {
      selected = local
    } else if (remote && !local) {
      selected = remote
    } else if (local && remote) {
      // Both have the token — keep the one with the latest updatedAt, tie → prefer remote
      const preferred = (local.updatedAt ?? 0) > (remote.updatedAt ?? 0) ? local : remote
      const lastUsed = Math.max(local.lastUsed ?? 0, remote.lastUsed ?? 0)
      selected = lastUsed > 0 ? { ...preferred, lastUsed } : preferred
    }

    if (!selected) continue
    const tombstone = tombstoneMap.get(id)
    if (tombstone && tombstone.deletedAt >= (selected.updatedAt ?? 0)) continue
    tombstoneMap.delete(id)
    tokens.push(selected)
  }

  const tombstones = [...tombstoneMap.values()]
  if (tokens.length > MAX_TOKENS || tombstones.length > MAX_TOKENS) {
    throw new RangeError(`Sync merge exceeds the ${MAX_TOKENS}-entry safety limit`)
  }
  return { tokens, tombstones }
}
