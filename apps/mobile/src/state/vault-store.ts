import {
  defaultStore,
  mergePersistedStore,
  normalizeTombstones,
  tokenSchema,
  type Store,
  type Token,
  type Tombstone,
} from '@yhtua/domain'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import { useStore as useZustandStore } from 'zustand'
import { storagePort } from '../ports/storage'

// The non-secret vault index, desktop-shaped and validated by the shared
// domain schemas: labels, issuers, ciphertext blobs, tombstones.
//
// MOBILE AT-REST INVARIANT: every persisted token is ciphertext
// (`otp.encrypted === true`). Unlike desktop (which still migrates legacy
// plaintext vaults), this store rejects plaintext tokens in every mutation
// AND drops them during hydration, so tampered or foreign storage can never
// put a plaintext secret at rest here.

const isCiphertextToken = (token: Token): boolean => token.otp.encrypted

/** Accepts only tokens that satisfy the shared schema AND the mobile at-rest
 * invariant. */
export const parseAtRestToken = (candidate: unknown): Token | null => {
  const parsed = tokenSchema.safeParse(candidate)
  if (!parsed.success || !isCiphertextToken(parsed.data)) return null
  return parsed.data
}

const mergeAtRest = (persisted: unknown, current: Store): Store => {
  const merged = mergePersistedStore(persisted, current)
  return { ...merged, tokens: merged.tokens.filter(isCiphertextToken) }
}

export const vaultStore = createStore(
  persist<Store>(() => defaultStore(), {
    name: 'yhtua',
    storage: createJSONStorage(() => storagePort),
    merge: mergeAtRest,
  }),
)

export type HydrationResult = { ok: boolean }

/** Drives AsyncStorage hydration explicitly (lazily, on first call — no
 * storage IO at module import) and SETTLES either way — success or failure —
 * so the lock machine's HYDRATION_COMPLETE can always fire fail-closed. A
 * hung storage read is bounded by the watchdog. */
let hydrationPromise: Promise<HydrationResult> | null = null

export const ensureVaultHydrated = (): Promise<HydrationResult> => {
  hydrationPromise ??= (async () => {
    const watchdog = new Promise<HydrationResult>((resolve) =>
      setTimeout(() => resolve({ ok: false }), 10_000),
    )
    const hydrate = (async () => {
      try {
        if (!vaultStore.persist.hasHydrated()) await vaultStore.persist.rehydrate()
        return { ok: vaultStore.persist.hasHydrated() }
      } catch {
        return { ok: false }
      }
    })()
    return Promise.race([hydrate, watchdog])
  })()
  return hydrationPromise
}

export const useVault = <T>(selector: (state: Store) => T): T =>
  useZustandStore(vaultStore, selector)

export const getVaultTokens = (): Token[] =>
  vaultStore.getState().tokens.toSorted((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))

export const addToken = (token: Token): boolean => {
  const parsed = parseAtRestToken(token)
  if (!parsed) return false
  const state = vaultStore.getState()
  if (state.tokens.some(({ id }) => id === parsed.id)) return false
  const tombstones = state.tombstones.filter(({ id }) => id !== parsed.id)
  vaultStore.setState({ tokens: [...state.tokens, parsed], tombstones })
  return true
}

export const deleteToken = (id: string) => {
  const state = vaultStore.getState()
  vaultStore.setState({
    tokens: state.tokens.filter((token) => token.id !== id),
    tombstones: normalizeTombstones([...state.tombstones, { id, deletedAt: Date.now() }]),
  })
}

export const replaceVault = (tokens: Token[], tombstones: Tombstone[]) => {
  vaultStore.setState({
    tokens: tokens.filter((token) => parseAtRestToken(token) !== null),
    tombstones: normalizeTombstones(tombstones),
  })
}

/** Deletes the persisted vault durably; callers dispatch VAULT_DESTROYED to
 * the lock machine only AFTER this resolves. */
export const destroyVaultStorage = async (): Promise<void> => {
  vaultStore.setState({ ...defaultStore() })
  await storagePort.removeItem('yhtua')
}
