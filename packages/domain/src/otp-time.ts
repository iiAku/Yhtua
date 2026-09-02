import { DEFAULT_PERIOD } from './schema'

export const getRemainingTime = (period: number = DEFAULT_PERIOD) =>
  period - (Math.floor(Date.now() / 1000) % period)

/** The RFC 6238 counter a code belongs to. A client that refreshes only when
 * the countdown reads exactly `period` misses the boundary whenever a tick is
 * late or skipped (a backgrounded timer, a busy frame) and then displays a
 * code for the previous step; comparing this number instead cannot drift. */
export const currentTimeStep = (period: number = DEFAULT_PERIOD, nowMs: number = Date.now()) =>
  Math.floor(nowMs / 1000 / period)
