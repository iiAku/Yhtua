import { describe, expect, it } from 'vitest'
import { currentTimeStep } from '../src/otp-time'

describe('TOTP time step', () => {
  it('advances once per period so a client can tell a code is stale', () => {
    const period = 30
    // A code generated at t is valid until the step number changes, whatever
    // the countdown reads — a client that refreshes only when the countdown
    // hits exactly the period shows a stale code after any missed tick.
    expect(currentTimeStep(period, 0)).toBe(0)
    expect(currentTimeStep(period, 29_999)).toBe(0)
    expect(currentTimeStep(period, 30_000)).toBe(1)
    expect(currentTimeStep(period, 61_000)).toBe(2)
  })
})
