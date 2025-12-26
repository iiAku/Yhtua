import { createStore } from "zustand/vanilla"
import { persist, createJSONStorage } from "zustand/middleware"
import { z } from 'zod'

export const DEFAULT_PERIOD = 30

export const DEFAULT_DIGITS = 6

export enum StoreVersion {
  V1_PLAINTEXT = 1,
  V2_ENCRYPTED = 2,
}

export const CURRENT_STORE_VERSION = StoreVersion.V2_ENCRYPTED

export const tokenSchema = z.object({
  id: z.string(),
  lastUsed: z.number().optional(),
  otp: z.object({
    issuer: z.string(),
    label: z.string(),
    algorithm: z.string(),
    digits: z.number().optional().default(6),
    period: z.number().optional().default(DEFAULT_PERIOD),
    secret: z.string(),
    encrypted: z.boolean().optional().default(false),
  })
})

export const exportImportSchema = z.object({
  version: z.string(),
  encrypted: z.boolean().optional().default(false),
  tokens: z.array(tokenSchema)
})

export const storeSchema = z.object({
  version: z.number().default(StoreVersion.V1_PLAINTEXT),
  tokens: z.array(tokenSchema)
})

export type Store = z.infer<typeof storeSchema>

export type Token = z.infer<typeof tokenSchema>

export const defaultStore = (): Store => ({ version: CURRENT_STORE_VERSION, tokens: [] })

export const store = createStore(
  persist<Store>(
    () => defaultStore(),
    {
      name: "yhtua",
      storage: createJSONStorage(() => localStorage),
    }
  )
)

export const clearStore = () => store.persist.clearStorage()

export const cleanupInvalidTokens = () => {
  const tokens = store.getState().tokens
  const validTokens = tokens.filter(token => tokenSchema.safeParse(token).success)
  if (validTokens.length !== tokens.length) {
    store.setState({ tokens: validTokens })
  }
}

export const getTokens = (): Token[] =>
  store.getState().tokens.toSorted((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))

export const updateTokenLastUsed = (tokenId: string) => {
  const tokens = store.getState().tokens.map(token =>
    token.id === tokenId ? { ...token, lastUsed: Date.now() } : token
  )
  store.setState({ tokens })
}

export const storeAddToken = (token: Token | Token[]) => {
  const tokens = Array.isArray(token) ? token : [token]
  const validTokens = tokens.filter(token => tokenSchema.safeParse(token).success)
  store.setState({ tokens: [...store.getState().tokens, ...validTokens] })
}

export const addTokenSchema = z.object({
  secret: z.string().refine(value => /^[A-Z2-7]+=*$/.test(value), {
    message: 'Your secret is not valid',
  }),
  label: z.string().min(1, { message: 'Label is required' }),
  digits: z.number().min(6).max(8).default(6),
})

export const getStoreVersion = (): StoreVersion => (store.getState().version ?? StoreVersion.V1_PLAINTEXT)

export const setStoreVersion = (version: StoreVersion) => store.setState({ version })

export const isStoreEncrypted = (): boolean => getStoreVersion() >= StoreVersion.V2_ENCRYPTED

export const updateToken = (tokenId: string, updates: Partial<Token>) => {
  const tokens = store.getState().tokens.map(token =>
    token.id === tokenId ? { ...token, ...updates } : token
  )
  store.setState({ tokens })
}

export const updateTokenOtp = (tokenId: string, otpUpdates: Partial<Token['otp']>) => {
  const tokens = store.getState().tokens.map(token =>
    token.id === tokenId
      ? { ...token, otp: { ...token.otp, ...otpUpdates } }
      : token
  )
  store.setState({ tokens })
}

export const replaceAllTokens = (tokens: Token[]) => store.setState({ tokens, version: CURRENT_STORE_VERSION })
