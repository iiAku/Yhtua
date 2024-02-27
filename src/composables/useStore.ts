import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from 'zod'

export const defaultStore = () => ({ tokens: [] })

export const DEFAULT_PERIOD = 30

export const DEFAULT_DIGITS = 6

const tokenSchema = z.object({
  id: z.string(),
  otp: z.object({
    issuer: z.string(),
    label: z.string(),
    algorithm: z.string(),
    digits: z.number().default(6),
    period: z.number().default(DEFAULT_PERIOD),
    secret: z.string()
  })
})

export const storeShema = z.object({
  tokens: z.array(tokenSchema)
})

export type Store = z.infer<typeof storeShema>

export type Token = z.infer<typeof tokenSchema>

export const clearStore = () => store.persist.clearStorage()

export const store = create<Store>()(
  persist(
    (set, get) => (defaultStore()),
    {
      name: "yhtua",
    }
  )
)