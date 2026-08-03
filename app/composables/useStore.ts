import { z } from 'zod'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

export const DEFAULT_PERIOD = 30

export const DEFAULT_DIGITS = 6

export const MAX_TOKENS = 10_000

export const MAX_IMPORT_BYTES = 16 * 1024 * 1024
export const MAX_ENCRYPTED_BACKUP_BYTES = 24 * 1024 * 1024

const MAX_LABEL_LENGTH = 256
const MAX_SECRET_LENGTH = 4 * 1024
const MAX_ENCRYPTED_SECRET_LENGTH = 8 * 1024
const MAX_ID_LENGTH = 128
// '1.0' is what Yhtua v1 wrote into its backups — still importable.
const SUPPORTED_BACKUP_VERSIONS = ['1.0', '1.0.0', '2.0.0', '2.1.0', '2.2.0', '2.3.0'] as const
const BASE32_PADDING_BY_REMAINDER = [0, undefined, 6, undefined, 4, 3, undefined, 1] as const
const BASE32_UNUSED_BITS_BY_REMAINDER = [0, undefined, 2, undefined, 4, 1, undefined, 3] as const

export const normalizeBase32Secret = (value: string) => value.replace(/[\s-]/g, '').toUpperCase()

export const isValidBase32Secret = (value: string) => {
  const match = /^([A-Z2-7]+)(=*)$/.exec(value)
  if (!match) return false
  const payload = match[1] ?? ''
  const paddingLength = match[2]?.length ?? 0
  const remainder = payload.length % 8
  const expectedPadding = BASE32_PADDING_BY_REMAINDER[remainder]
  if (expectedPadding === undefined || (paddingLength > 0 && paddingLength !== expectedPadding)) {
    return false
  }

  // Reject non-canonical encodings whose unused trailing bits are non-zero.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const lastValue = alphabet.indexOf(payload.at(-1) ?? '')
  const unusedBits = BASE32_UNUSED_BITS_BY_REMAINDER[remainder]
  return lastValue >= 0 && unusedBits !== undefined && lastValue % 2 ** unusedBits === 0
}

export enum StoreVersion {
  V1_PLAINTEXT = 1,
  V2_ENCRYPTED = 2,
}

export const CURRENT_STORE_VERSION = StoreVersion.V2_ENCRYPTED

const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

// Older backups stored the algorithm as a free-form string ("sha1", "SHA-256").
// Bounded before the transform: every other string field here is capped, and an
// unbounded input would be rewritten and upper-cased before the enum rejects it.
const algorithmSchema = z
  .string()
  .max(16)
  .transform((value) => value.replace(/-/g, '').toUpperCase())
  .pipe(z.enum(['SHA1', 'SHA256', 'SHA512']))

const otpSchema = z
  .object({
    issuer: z.string().trim().max(MAX_LABEL_LENGTH).optional().default(''),
    label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
    algorithm: algorithmSchema.optional().default('SHA1'),
    digits: z.number().int().min(6).max(8).optional().default(DEFAULT_DIGITS),
    period: z.number().int().min(15).max(300).optional().default(DEFAULT_PERIOD),
    secret: z.string().min(1).max(MAX_ENCRYPTED_SECRET_LENGTH),
    encrypted: z.boolean().optional().default(false),
  })
  .strict()
  .refine(({ encrypted, secret }) => encrypted || secret.length <= MAX_SECRET_LENGTH, {
    message: 'Plaintext secret is too long',
    path: ['secret'],
  })

export const tokenSchema = z
  .object({
    id: z.string().min(1).max(MAX_ID_LENGTH),
    lastUsed: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
    otp: otpSchema,
  })
  .strict()

export const tombstoneSchema = z
  .object({
    id: z.string().min(1).max(MAX_ID_LENGTH),
    deletedAt: timestampSchema,
  })
  .strict()

export type Tombstone = z.infer<typeof tombstoneSchema>

const uniqueIds = (items: Array<{ id: string }>) =>
  new Set(items.map(({ id }) => id)).size === items.length

export const exportImportSchema = z
  .object({
    version: z.enum(SUPPORTED_BACKUP_VERSIONS),
    encrypted: z.literal(false).optional().default(false),
    syncedAt: timestampSchema.optional(),
    tokens: z.array(tokenSchema).max(MAX_TOKENS),
    tombstones: z.array(tombstoneSchema).max(MAX_TOKENS).optional().default([]),
  })
  .strict()
  .refine(({ tokens }) => uniqueIds(tokens), { message: 'Duplicate token identifiers' })
  .refine(({ tombstones }) => uniqueIds(tombstones), { message: 'Duplicate tombstone identifiers' })

export const plaintextBackupSchema = exportImportSchema
  .refine(({ tokens }) => tokens.every((token) => !token.otp.encrypted), {
    message: 'Backup contains device-bound encrypted secrets',
  })
  .refine(({ tokens }) => tokens.every((token) => token.otp.secret.length <= MAX_SECRET_LENGTH), {
    message: 'Backup contains an oversized plaintext secret',
  })
  .transform((backup) => ({
    ...backup,
    tokens: backup.tokens.map((token) => ({
      ...token,
      otp: { ...token.otp, secret: normalizeBase32Secret(token.otp.secret) },
    })),
  }))
  .refine(({ tokens }) => tokens.every((token) => isValidBase32Secret(token.otp.secret)), {
    message: 'Backup contains an invalid Base32 secret',
  })

export const portableBackupMetadataMatches = (
  outer: { version: string; syncedAt?: number },
  inner: { version: string; syncedAt?: number },
) =>
  outer.version === inner.version &&
  (outer.version !== '2.3.0' || outer.syncedAt === inner.syncedAt)

export const storeSchema = z
  .object({
    version: z
      .number()
      .int()
      .min(StoreVersion.V1_PLAINTEXT)
      .max(CURRENT_STORE_VERSION)
      .default(StoreVersion.V1_PLAINTEXT),
    tokens: z.array(tokenSchema).max(MAX_TOKENS),
    tombstones: z.array(tombstoneSchema).max(MAX_TOKENS).optional().default([]),
  })
  .strict()
  .refine(({ tokens }) => uniqueIds(tokens), { message: 'Duplicate token identifiers' })
  .refine(({ tombstones }) => uniqueIds(tombstones), {
    message: 'Duplicate tombstone identifiers',
  })
  .refine(
    ({ tokens, tombstones }) => {
      const tokenIds = new Set(tokens.map(({ id }) => id))
      return tombstones.every(({ id }) => !tokenIds.has(id))
    },
    { message: 'A token cannot also be deleted' },
  )

export type Store = z.infer<typeof storeSchema>

export type Token = z.infer<typeof tokenSchema>

export const defaultStore = (): Store => ({
  version: CURRENT_STORE_VERSION,
  tokens: [],
  tombstones: [],
})

const persistedStoreEnvelopeSchema = z
  .object({
    version: z
      .number()
      .int()
      .min(StoreVersion.V1_PLAINTEXT)
      .max(CURRENT_STORE_VERSION)
      .default(StoreVersion.V1_PLAINTEXT),
    tokens: z.array(z.unknown()).max(MAX_TOKENS),
    tombstones: z.array(z.unknown()).max(MAX_TOKENS).optional().default([]),
  })
  .passthrough()

export const mergePersistedStore = (persisted: unknown, current: Store): Store => {
  const envelope = persistedStoreEnvelopeSchema.safeParse(persisted)
  if (!envelope.success) return current

  const tokensById = new Map<string, Token>()
  for (const candidate of envelope.data.tokens) {
    const parsed = tokenSchema.safeParse(candidate)
    if (parsed.success && !tokensById.has(parsed.data.id)) {
      tokensById.set(parsed.data.id, parsed.data)
    }
  }

  const tombstonesById = new Map<string, Tombstone>()
  for (const candidate of envelope.data.tombstones) {
    const parsed = tombstoneSchema.safeParse(candidate)
    if (!parsed.success) continue
    const existing = tombstonesById.get(parsed.data.id)
    if (!existing || parsed.data.deletedAt > existing.deletedAt) {
      tombstonesById.set(parsed.data.id, parsed.data)
    }
  }

  for (const [id, token] of tokensById) {
    const tombstone = tombstonesById.get(id)
    if (!tombstone) continue
    if (tombstone.deletedAt >= (token.updatedAt ?? 0)) tokensById.delete(id)
    else tombstonesById.delete(id)
  }

  return {
    version: envelope.data.version,
    tokens: [...tokensById.values()],
    tombstones: [...tombstonesById.values()],
  }
}

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

export const addTokenSchema = z
  .object({
    secret: z
      .string()
      .transform(normalizeBase32Secret)
      .pipe(
        z
          .string()
          .min(8, { message: 'Secret must contain at least 8 Base32 characters' })
          .max(1024, { message: 'Secret is too long' })
          .refine(isValidBase32Secret, { message: 'Secret must be valid Base32' }),
      ),
    label: z.string().trim().min(1, { message: 'Label is required' }).max(MAX_LABEL_LENGTH),
    digits: z.number().int().min(6).max(8).default(DEFAULT_DIGITS),
  })
  .strict()

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

const normalizeTombstones = (tombstones: Tombstone[]) => {
  const byId = new Map<string, Tombstone>()
  for (const tombstone of tombstones) {
    const parsed = tombstoneSchema.parse(tombstone)
    const current = byId.get(parsed.id)
    if (!current || parsed.deletedAt > current.deletedAt) byId.set(parsed.id, parsed)
  }
  return [...byId.values()]
    .toSorted((left, right) => right.deletedAt - left.deletedAt)
    .slice(0, MAX_TOKENS)
}

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
