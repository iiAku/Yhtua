import {
  CURRENT_STORE_VERSION,
  defaultStore,
  MAX_TOKENS,
  mergePersistedStore,
  normalizeTombstones,
  StoreVersion,
  tokenSchema,
  type Store as DomainStore,
  type Token as DomainToken,
  type Tombstone as DomainTombstone,
} from '@yhtua/domain'
import { z } from 'zod'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

// The domain package owns every schema, limit, and merge rule; this composable
// owns the desktop persistence (zustand + localStorage) and the operations
// bound to that store. Re-exports below keep Nuxt auto-imports working for
// existing call sites.
export {
  addTokenSchema,
  CURRENT_STORE_VERSION,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  defaultStore,
  exportImportSchema,
  isValidBase32Secret,
  MAX_ENCRYPTED_BACKUP_BYTES,
  MAX_IMPORT_BYTES,
  MAX_TOKENS,
  mergePersistedStore,
  normalizeBase32Secret,
  plaintextBackupSchema,
  portableBackupMetadataMatches,
  StoreVersion,
  storeSchema,
  tokenSchema,
  tombstoneSchema,
} from '@yhtua/domain'

// Local type aliases (not bare re-exports) so Nuxt's auto-import type scanner
// keeps `Token`/`Tombstone`/`Store` available as ambient names across the app.
export type Token = DomainToken
export type Tombstone = DomainTombstone
export type Store = DomainStore

export const store = createStore(
  persist<Store>(() => defaultStore(), {
    name: 'yhtua',
    storage: createJSONStorage(() => localStorage),
    merge: mergePersistedStore,
  }),
)

export const cleanupInvalidTokens = () => {
  const tokens = store.getState().tokens
  const validTokens = tokens.filter((token) => tokenSchema.safeParse(token).success)
  if (validTokens.length !== tokens.length) {
    store.setState({ tokens: validTokens })
  }
}

let cachedTokens: Token[] = []
let lastTokensRef: Token[] = []

const updateCachedTokens = () => {
  const tokens = store.getState().tokens
  if (tokens === lastTokensRef) return
  cachedTokens = tokens.toSorted((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  lastTokensRef = tokens
}

store.subscribe(updateCachedTokens)
updateCachedTokens()

export const getTokens = (): Token[] => cachedTokens

export const updateTokenLastUsed = (tokenId: string) => {
  const tokens = store
    .getState()
    .tokens.map((token) => (token.id === tokenId ? { ...token, lastUsed: Date.now() } : token))
  store.setState({ tokens })
}

export const storeAddToken = (token: Token | Token[]) => {
  const tokens = Array.isArray(token) ? token : [token]
  const state = store.getState()
  const currentTokens = state.tokens
  const seen = new Set(currentTokens.map(({ id }) => id))
  const capacity = Math.max(0, MAX_TOKENS - currentTokens.length)
  const tombstonesById = new Map(state.tombstones.map((tombstone) => [tombstone.id, tombstone]))
  const now = Date.now()

  const validTokens: Token[] = []
  for (const token of tokens) {
    if (validTokens.length >= capacity) break
    // Store the parsed result, not the input: that is what upgrades legacy
    // fields (loose algorithm casing, missing issuer) to the current shape.
    const parsed = tokenSchema.safeParse(token)
    if (!parsed.success || seen.has(parsed.data.id)) continue
    seen.add(parsed.data.id)

    // Backups keep token ids, so re-adding one you previously deleted collides
    // with its tombstone. Adding is an explicit resurrection: drop the tombstone
    // and date the token past the deletion, or mergePersistedStore wipes it on
    // the next load and the next sync deletes it again.
    if (tombstonesById.delete(parsed.data.id)) {
      validTokens.push({ ...parsed.data, updatedAt: Math.max(parsed.data.updatedAt ?? 0, now) })
      continue
    }
    validTokens.push(parsed.data)
  }

  store.setState({
    tokens: [...currentTokens, ...validTokens],
    tombstones: [...tombstonesById.values()],
  })
  return validTokens.length
}

export const getStoreVersion = (): StoreVersion =>
  store.getState().version ?? StoreVersion.V1_PLAINTEXT

export const updateTokenOtp = (tokenId: string, otpUpdates: Partial<Token['otp']>) => {
  const tokens = store.getState().tokens.map((token) =>
    token.id === tokenId
      ? tokenSchema.parse({
          ...token,
          otp: { ...token.otp, ...otpUpdates },
          updatedAt: Date.now(),
        })
      : token,
  )
  store.setState({ tokens })
}

export const replaceAllTokens = (tokens: Token[]) => {
  const parsed = z.array(tokenSchema).max(MAX_TOKENS).parse(tokens)
  store.setState({ tokens: parsed, version: CURRENT_STORE_VERSION })
}

export const getTombstones = (): Tombstone[] => store.getState().tombstones ?? []

export const setTombstones = (tombstones: Tombstone[]) =>
  store.setState({ tombstones: normalizeTombstones(tombstones) })

export const storeDeleteToken = (id: string) => {
  const state = store.getState()
  store.setState({
    tokens: state.tokens.filter((token) => token.id !== id),
    tombstones: normalizeTombstones([...state.tombstones, { id, deletedAt: Date.now() }]),
  })
}

export const storeDeleteAllTokens = () => {
  const state = store.getState()
  const deletedAt = Date.now()
  store.setState({
    tokens: [],
    tombstones: normalizeTombstones([
      ...state.tombstones,
      ...state.tokens.map(({ id }) => ({ id, deletedAt })),
    ]),
  })
}

export const pruneTombstones = () => setTombstones(getTombstones())
