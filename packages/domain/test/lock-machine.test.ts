import { describe, expect, it } from 'vitest'
import {
  initialLockMachine,
  transition,
  type LockConfig,
  type LockEffect,
  type LockEvent,
  type LockMachine,
  type LockState,
} from '../src'

const config: LockConfig = { backgroundLockMs: 60_000, idleLockMs: 300_000, maxAuthFailures: 5 }

const STATES: LockState[] = [
  'hydrating',
  'uninitialized',
  'locked',
  'unlocking',
  'unlocked',
  'masked',
]

const baseMachine = (state: LockState): LockMachine => ({
  state,
  authFailures: 0,
  authAttempt: 1,
  secretEpoch: 0,
  foreground: true,
  keyMissing: false,
})

// One representative event per event type (foreground, current attempt id,
// within-grace elapsed). Backgrounded, stale-attempt, and over-limit variants
// are pinned by the property cases below the exhaustive table.
const EVENTS: LockEvent[] = [
  { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
  { type: 'UNLOCK_REQUESTED' },
  { type: 'AUTH_SUCCEEDED', attemptId: 1 },
  { type: 'AUTH_FAILED', attemptId: 1 },
  { type: 'APP_BACKGROUNDED' },
  { type: 'APP_FOREGROUNDED', elapsedMs: 1_000 },
  { type: 'IDLE_TIMEOUT' },
  { type: 'USER_ACTIVITY' },
  { type: 'MANUAL_LOCK' },
  { type: 'KEY_RESTORED' },
  { type: 'VAULT_CREATED' },
  { type: 'VAULT_DESTROYED' },
]

type Expected = { state: LockState; effects: LockEffect[] }

// EVERY state × event pair is asserted here. A missing entry fails the suite,
// so no transition can be added or removed without updating this table.
const TABLE: Record<LockState, Record<LockEvent['type'], Expected>> = {
  hydrating: {
    HYDRATION_COMPLETE: { state: 'locked', effects: [] },
    UNLOCK_REQUESTED: { state: 'hydrating', effects: [] },
    AUTH_SUCCEEDED: { state: 'hydrating', effects: [] },
    AUTH_FAILED: { state: 'hydrating', effects: [] },
    APP_BACKGROUNDED: { state: 'hydrating', effects: [] },
    APP_FOREGROUNDED: { state: 'hydrating', effects: [] },
    IDLE_TIMEOUT: { state: 'hydrating', effects: [] },
    USER_ACTIVITY: { state: 'hydrating', effects: [] },
    MANUAL_LOCK: { state: 'hydrating', effects: [] },
    KEY_RESTORED: { state: 'hydrating', effects: [] },
    VAULT_CREATED: { state: 'hydrating', effects: [] },
    VAULT_DESTROYED: { state: 'hydrating', effects: [] },
  },
  uninitialized: {
    HYDRATION_COMPLETE: { state: 'uninitialized', effects: [] },
    UNLOCK_REQUESTED: { state: 'uninitialized', effects: [] },
    AUTH_SUCCEEDED: { state: 'uninitialized', effects: [] },
    AUTH_FAILED: { state: 'uninitialized', effects: [] },
    APP_BACKGROUNDED: { state: 'uninitialized', effects: [] },
    APP_FOREGROUNDED: { state: 'uninitialized', effects: [] },
    IDLE_TIMEOUT: { state: 'uninitialized', effects: [] },
    USER_ACTIVITY: { state: 'uninitialized', effects: [] },
    MANUAL_LOCK: { state: 'uninitialized', effects: [] },
    KEY_RESTORED: { state: 'uninitialized', effects: [] },
    VAULT_CREATED: { state: 'unlocked', effects: ['START_IDLE_TIMER'] },
    VAULT_DESTROYED: { state: 'uninitialized', effects: [] },
  },
  locked: {
    HYDRATION_COMPLETE: { state: 'locked', effects: [] },
    UNLOCK_REQUESTED: { state: 'unlocking', effects: ['PROMPT_AUTH'] },
    AUTH_SUCCEEDED: { state: 'locked', effects: [] },
    AUTH_FAILED: { state: 'locked', effects: [] },
    APP_BACKGROUNDED: { state: 'locked', effects: ['MASK_UI'] },
    APP_FOREGROUNDED: { state: 'locked', effects: ['UNMASK_UI'] },
    IDLE_TIMEOUT: { state: 'locked', effects: [] },
    USER_ACTIVITY: { state: 'locked', effects: [] },
    MANUAL_LOCK: { state: 'locked', effects: [] },
    KEY_RESTORED: { state: 'locked', effects: [] },
    VAULT_CREATED: { state: 'locked', effects: [] },
    VAULT_DESTROYED: {
      state: 'uninitialized',
      effects: ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD'],
    },
  },
  unlocking: {
    HYDRATION_COMPLETE: { state: 'unlocking', effects: [] },
    UNLOCK_REQUESTED: { state: 'unlocking', effects: [] },
    AUTH_SUCCEEDED: { state: 'unlocked', effects: ['UNMASK_UI', 'START_IDLE_TIMER'] },
    AUTH_FAILED: { state: 'locked', effects: [] },
    APP_BACKGROUNDED: { state: 'unlocking', effects: [] },
    APP_FOREGROUNDED: { state: 'unlocking', effects: ['PROMPT_AUTH'] },
    IDLE_TIMEOUT: { state: 'locked', effects: ['CLEAR_SECRET_CACHE'] },
    USER_ACTIVITY: { state: 'unlocking', effects: [] },
    MANUAL_LOCK: { state: 'locked', effects: ['CLEAR_SECRET_CACHE'] },
    KEY_RESTORED: { state: 'unlocking', effects: [] },
    VAULT_CREATED: { state: 'unlocking', effects: [] },
    VAULT_DESTROYED: {
      state: 'uninitialized',
      effects: ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD'],
    },
  },
  unlocked: {
    HYDRATION_COMPLETE: { state: 'unlocked', effects: [] },
    UNLOCK_REQUESTED: { state: 'unlocked', effects: [] },
    AUTH_SUCCEEDED: { state: 'unlocked', effects: [] },
    AUTH_FAILED: { state: 'unlocked', effects: [] },
    APP_BACKGROUNDED: {
      state: 'masked',
      effects: ['MASK_UI', 'CLEAR_SECRET_CACHE', 'CANCEL_IDLE_TIMER'],
    },
    APP_FOREGROUNDED: { state: 'unlocked', effects: [] },
    IDLE_TIMEOUT: { state: 'locked', effects: ['CLEAR_SECRET_CACHE', 'CANCEL_IDLE_TIMER'] },
    USER_ACTIVITY: { state: 'unlocked', effects: ['START_IDLE_TIMER'] },
    MANUAL_LOCK: {
      state: 'locked',
      effects: ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD', 'CANCEL_IDLE_TIMER'],
    },
    KEY_RESTORED: { state: 'unlocked', effects: [] },
    VAULT_CREATED: { state: 'unlocked', effects: [] },
    VAULT_DESTROYED: {
      state: 'uninitialized',
      effects: ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD', 'CANCEL_IDLE_TIMER'],
    },
  },
  masked: {
    HYDRATION_COMPLETE: { state: 'masked', effects: [] },
    UNLOCK_REQUESTED: { state: 'masked', effects: [] },
    AUTH_SUCCEEDED: { state: 'masked', effects: [] },
    AUTH_FAILED: { state: 'masked', effects: [] },
    APP_BACKGROUNDED: { state: 'masked', effects: [] },
    APP_FOREGROUNDED: { state: 'unlocked', effects: ['UNMASK_UI', 'START_IDLE_TIMER'] },
    IDLE_TIMEOUT: { state: 'locked', effects: [] },
    USER_ACTIVITY: { state: 'masked', effects: [] },
    MANUAL_LOCK: { state: 'locked', effects: ['WIPE_CLIPBOARD'] },
    KEY_RESTORED: { state: 'masked', effects: [] },
    VAULT_CREATED: { state: 'masked', effects: [] },
    VAULT_DESTROYED: { state: 'uninitialized', effects: ['WIPE_CLIPBOARD'] },
  },
}

describe('lock machine: exhaustive transition table', () => {
  for (const state of STATES) {
    for (const event of EVENTS) {
      it(`${state} × ${event.type}`, () => {
        const expected = TABLE[state][event.type]
        expect(expected, `missing table entry for ${state} × ${event.type}`).toBeDefined()
        const outcome = transition(baseMachine(state), event, config)
        expect(outcome.machine.state).toBe(expected.state)
        expect(outcome.effects).toEqual(expected.effects)
      })
    }
  }
})

describe('lock machine: fail-closed properties', () => {
  it('starts hydrating and reaches nothing before hydration completes', () => {
    let machine = initialLockMachine()
    for (const event of EVENTS.filter((candidate) => candidate.type !== 'HYDRATION_COMPLETE')) {
      machine = transition(machine, event, config).machine
    }
    expect(machine.state).toBe('hydrating')
  })

  it('ciphertext without a key hydrates to locked with keyMissing set', () => {
    const outcome = transition(
      initialLockMachine(),
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: false },
      config,
    )
    expect(outcome.machine.state).toBe('locked')
    expect(outcome.machine.keyMissing).toBe(true)
  })

  it('a key-missing vault refuses ordinary unlocking until KEY_RESTORED', () => {
    let machine = { ...baseMachine('locked'), keyMissing: true }
    const refused = transition(machine, { type: 'UNLOCK_REQUESTED' }, config)
    expect(refused.machine.state).toBe('locked')
    expect(refused.effects).toEqual([])
    machine = transition(refused.machine, { type: 'KEY_RESTORED' }, config).machine
    expect(machine.keyMissing).toBe(false)
    const granted = transition(machine, { type: 'UNLOCK_REQUESTED' }, config)
    expect(granted.machine.state).toBe('unlocking')
  })

  it('an auth success arriving while backgrounded never unlocks', () => {
    let machine = baseMachine('unlocking')
    machine = transition(machine, { type: 'APP_BACKGROUNDED' }, config).machine
    const outcome = transition(machine, { type: 'AUTH_SUCCEEDED', attemptId: 1 }, config)
    expect(outcome.machine.state).toBe('unlocking')
    expect(outcome.machine.foreground).toBe(false)
  })

  it('an unlocked session cannot survive a long absence via any event ordering', () => {
    // The hole the panel review found: auth completes during the biometric
    // sheet blip, THEN the phone sits in a drawer. Foregrounding must re-lock.
    let machine = baseMachine('unlocking')
    machine = transition(machine, { type: 'APP_BACKGROUNDED' }, config).machine
    machine = transition(machine, { type: 'APP_FOREGROUNDED', elapsedMs: 100 }, config).machine
    // Foregrounding re-prompts with a fresh attempt id; the pre-background
    // completion (attemptId 1) is now stale and ignored.
    expect(
      transition(machine, { type: 'AUTH_SUCCEEDED', attemptId: 1 }, config).machine.state,
    ).toBe('unlocking')
    machine = transition(
      machine,
      { type: 'AUTH_SUCCEEDED', attemptId: machine.authAttempt },
      config,
    ).machine
    expect(machine.state).toBe('unlocked')
    // Host maps the sheet blip incorrectly and never sends APP_BACKGROUNDED:
    const outcome = transition(
      machine,
      { type: 'APP_FOREGROUNDED', elapsedMs: config.backgroundLockMs + 1 },
      config,
    )
    expect(outcome.machine.state).toBe('locked')
    expect(outcome.effects).toContain('CLEAR_SECRET_CACHE')
  })

  it('stale auth completions are ignored in both directions', () => {
    const machine = { ...baseMachine('unlocking'), authAttempt: 3 }
    expect(
      transition(machine, { type: 'AUTH_SUCCEEDED', attemptId: 2 }, config).machine.state,
    ).toBe('unlocking')
    expect(transition(machine, { type: 'AUTH_FAILED', attemptId: 2 }, config).machine.state).toBe(
      'unlocking',
    )
    expect(
      transition(machine, { type: 'AUTH_SUCCEEDED', attemptId: 3 }, config).machine.state,
    ).toBe('unlocked')
  })

  it('every unlock request issues a fresh attempt id', () => {
    let machine = baseMachine('locked')
    const first = transition(machine, { type: 'UNLOCK_REQUESTED' }, config)
    machine = transition(first.machine, { type: 'AUTH_FAILED', attemptId: 2 }, config).machine
    const second = transition(machine, { type: 'UNLOCK_REQUESTED' }, config)
    expect(second.machine.authAttempt).toBe(first.machine.authAttempt + 1)
  })

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'invalid elapsed duration %s locks instead of taking the grace path',
    (elapsedMs) => {
      const outcome = transition(
        baseMachine('masked'),
        { type: 'APP_FOREGROUNDED', elapsedMs },
        config,
      )
      expect(outcome.machine.state).toBe('locked')
    },
  )

  it('a zero background limit disables grace even for a zero-length absence', () => {
    const zeroGrace = { ...config, backgroundLockMs: 0 }
    const outcome = transition(
      baseMachine('masked'),
      { type: 'APP_FOREGROUNDED', elapsedMs: 0 },
      zeroGrace,
    )
    expect(outcome.machine.state).toBe('locked')
  })

  it('an invalid failure limit clears the cache on every failure', () => {
    const broken = { ...config, maxAuthFailures: Number.NaN }
    let machine = baseMachine('locked')
    machine = transition(machine, { type: 'UNLOCK_REQUESTED' }, broken).machine
    const failed = transition(
      machine,
      { type: 'AUTH_FAILED', attemptId: machine.authAttempt },
      broken,
    )
    expect(failed.effects).toContain('CLEAR_SECRET_CACHE')
  })

  it('a backgrounded vault creation lands on locked, never unlocked or dead', () => {
    let machine = baseMachine('uninitialized')
    machine = transition(machine, { type: 'APP_BACKGROUNDED' }, config).machine
    const outcome = transition(machine, { type: 'VAULT_CREATED' }, config)
    expect(outcome.machine.state).toBe('locked')
  })

  it('an invalid background limit disables the grace path entirely', () => {
    const broken = { ...config, backgroundLockMs: Number.NaN }
    const outcome = transition(
      baseMachine('masked'),
      { type: 'APP_FOREGROUNDED', elapsedMs: 10 },
      broken,
    )
    expect(outcome.machine.state).toBe('locked')
  })

  it('the secret epoch increments with every cache clear', () => {
    const outcome = transition(baseMachine('unlocked'), { type: 'MANUAL_LOCK' }, config)
    expect(outcome.effects).toContain('CLEAR_SECRET_CACHE')
    expect(outcome.machine.secretEpoch).toBe(1)
    const again = transition(outcome.machine, { type: 'VAULT_DESTROYED' }, config)
    expect(again.machine.secretEpoch).toBe(2)
  })

  it('accumulated auth failures clear the secret cache at the threshold', () => {
    let machine = baseMachine('locked')
    for (let attempt = 0; attempt < config.maxAuthFailures; attempt += 1) {
      machine = transition(machine, { type: 'UNLOCK_REQUESTED' }, config).machine
      const failed = transition(
        machine,
        { type: 'AUTH_FAILED', attemptId: machine.authAttempt },
        config,
      )
      machine = failed.machine
      if (attempt === config.maxAuthFailures - 1) {
        expect(failed.effects).toContain('CLEAR_SECRET_CACHE')
      }
    }
    expect(machine.authFailures).toBe(config.maxAuthFailures)
    expect(machine.state).toBe('locked')
  })

  it('a successful unlock resets the failure counter', () => {
    let machine = { ...baseMachine('locked'), authFailures: 3 }
    machine = transition(machine, { type: 'UNLOCK_REQUESTED' }, config).machine
    machine = transition(
      machine,
      { type: 'AUTH_SUCCEEDED', attemptId: machine.authAttempt },
      config,
    ).machine
    expect(machine.authFailures).toBe(0)
  })

  it('unlocked is only mintable through the legitimate paths', () => {
    for (const state of STATES) {
      for (const event of EVENTS) {
        const outcome = transition(baseMachine(state), event, config)
        if (outcome.machine.state !== 'unlocked') continue
        const legitimate =
          (state === 'unlocking' && event.type === 'AUTH_SUCCEEDED') ||
          (state === 'uninitialized' && event.type === 'VAULT_CREATED') ||
          (state === 'masked' && event.type === 'APP_FOREGROUNDED') ||
          state === 'unlocked'
        expect(legitimate, `${state} × ${event.type} illegitimately unlocked`).toBe(true)
      }
    }
  })
})
