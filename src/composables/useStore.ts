import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from 'zod/v4-mini'

export const defaultStore = () => ({ tokens: [] })


export const DEFAULT_PERIOD = 30;
export const DEFAULT_DIGITS = 6;

export const tokenSchema = z.object({
  id: z.string(),
  otp: z.object({
    issuer: z.string(),
    label: z.string(),
    algorithm: z.string(),
    digits: z._default(z.number(), DEFAULT_DIGITS),
    period: z._default(z.number(), DEFAULT_PERIOD),
    secret: z.string(),
  }),
});


export const exportImportSchema = z.object({
  version: z.string(),
  tokens: z.array(tokenSchema)
})

export const storeShema = z.object({
  tokens: z.array(tokenSchema)
})

export type Store = z.infer<typeof storeShema>

export type Token = z.infer<typeof tokenSchema>

export const clearStore = () => store.persist.clearStorage()


export const store = create<Store>()(
  persist(
    (set, get) => {
      const store = get()
      if (!store) {
        return defaultStore()
      }
      return store
    },
    {
      name: "yhtua",
    }
  )
)

export const getTokens = (): Token[] => {
  const tokens = store.getState().tokens
  store.setState({ tokens: tokens.filter(token => tokenSchema.safeParse(token).success) })
  return store.getState().tokens
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