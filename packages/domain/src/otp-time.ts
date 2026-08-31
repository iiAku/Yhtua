import { DEFAULT_PERIOD } from './schema'

export const getRemainingTime = (period: number = DEFAULT_PERIOD) =>
  period - (Math.floor(Date.now() / 1000) % period)
