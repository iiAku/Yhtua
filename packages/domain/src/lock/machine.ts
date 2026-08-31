// The lock-state machine every Yhtua client runs. Pure reducer: no timers, no
// IO, no clocks — hosts feed events (with monotonic elapsed durations, never
// wall-clock deltas) and execute the returned effects.
//
// Fail-closed invariants (all pinned by tests):
// - Nothing is reachable before HYDRATION_COMPLETE.
// - `unlocked` is mintable ONLY in the foreground: an auth result or vault
//   creation arriving while backgrounded is ignored (the host re-prompts).
// - Every APP_FOREGROUNDED re-checks the monotonic absence duration — even in
//   `unlocked` — so no ordering of events can carry an unlocked session
//   across a longer-than-configured absence.
// - Invalid elapsed durations or configuration (NaN, negative, non-finite)
//   count as "limit exceeded", never as the grace path.
// - Auth results carry the attempt id issued by UNLOCK_REQUESTED; stale
//   completions are ignored.
// - `secretEpoch` increments with every CLEAR_SECRET_CACHE effect: hosts tag
//   in-flight decrypt/render continuations with the epoch and drop stale ones.
// - A vault whose key is missing (`keyMissing`) never accepts ordinary
//   unlocking; the host surfaces recovery and reports KEY_RESTORED.
//
// Host contract for the masked→unlocked grace path: it is only sound when the
// platform keeps the decryption session alive for `backgroundLockMs` after
// backgrounding. A host whose native layer zeroizes its key session on EVERY
// background (the fail-closed mobile default) must configure
// `backgroundLockMs: 0` so foregrounding always re-authenticates.

export type LockState =
  | 'hydrating'
  | 'uninitialized'
  | 'locked'
  | 'unlocking'
  | 'unlocked'
  | 'masked'

export type LockEvent =
  | { type: 'HYDRATION_COMPLETE'; hasVault: boolean; hasKey: boolean }
  | { type: 'UNLOCK_REQUESTED' }
  | { type: 'AUTH_SUCCEEDED'; attemptId: number }
  | { type: 'AUTH_FAILED'; attemptId: number }
  | { type: 'APP_BACKGROUNDED' }
  /** elapsedMs is the host's MONOTONIC time spent backgrounded (never derived
   * from wall clocks, which the user can change). */
  | { type: 'APP_FOREGROUNDED'; elapsedMs: number }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'USER_ACTIVITY' }
  | { type: 'MANUAL_LOCK' }
  | { type: 'KEY_RESTORED' }
  | { type: 'VAULT_CREATED' }
  | { type: 'VAULT_DESTROYED' }

export type LockEffect =
  | 'MASK_UI'
  | 'UNMASK_UI'
  | 'CLEAR_SECRET_CACHE'
  | 'WIPE_CLIPBOARD'
  | 'PROMPT_AUTH'
  | 'START_IDLE_TIMER'
  | 'CANCEL_IDLE_TIMER'

export type LockConfig = {
  backgroundLockMs: number
  idleLockMs: number
  maxAuthFailures: number
}

export type LockMachine = {
  state: LockState
  authFailures: number
  /** Host-visible auth attempt id; AUTH_* events must echo it. */
  authAttempt: number
  /** Increments on every CLEAR_SECRET_CACHE; hosts drop stale async work. */
  secretEpoch: number
  foreground: boolean
  keyMissing: boolean
}

export type LockTransition = {
  machine: LockMachine
  effects: LockEffect[]
}

export const initialLockMachine = (): LockMachine => ({
  state: 'hydrating',
  authFailures: 0,
  authAttempt: 0,
  secretEpoch: 0,
  foreground: true,
  keyMissing: false,
})

/** Invalid values fail closed: only a finite duration within a finite,
 * non-negative limit earns the grace path. */
const withinBackgroundGrace = (elapsedMs: number, config: LockConfig): boolean =>
  Number.isFinite(elapsedMs) &&
  elapsedMs >= 0 &&
  Number.isFinite(config.backgroundLockMs) &&
  config.backgroundLockMs > 0 &&
  elapsedMs < config.backgroundLockMs

/** Invalid failure limits fail closed: every failure clears the cache. */
const exceedsFailureLimit = (authFailures: number, config: LockConfig): boolean =>
  !Number.isFinite(config.maxAuthFailures) ||
  config.maxAuthFailures <= 0 ||
  authFailures >= config.maxAuthFailures

const result = (machine: LockMachine, effects: LockEffect[]): LockTransition => {
  const secretEpoch = effects.includes('CLEAR_SECRET_CACHE')
    ? machine.secretEpoch + 1
    : machine.secretEpoch
  return { machine: { ...machine, secretEpoch }, effects }
}

export const transition = (
  previous: LockMachine,
  event: LockEvent,
  config: LockConfig,
): LockTransition => {
  // Lifecycle is tracked in machine context regardless of state so no state
  // can mint `unlocked` while backgrounded.
  const machine: LockMachine =
    event.type === 'APP_BACKGROUNDED'
      ? { ...previous, foreground: false }
      : event.type === 'APP_FOREGROUNDED'
        ? { ...previous, foreground: true }
        : previous

  switch (machine.state) {
    case 'hydrating':
      // Nothing is reachable before hydration: storage reads and key-presence
      // checks are async (AsyncStorage on mobile), and acting on a partial
      // view could initialize a fresh vault over one that merely loads slowly.
      if (event.type === 'HYDRATION_COMPLETE') {
        // Ciphertext with a missing key lands on `locked` with `keyMissing`
        // set: ordinary unlocking is refused until KEY_RESTORED.
        return event.hasVault
          ? result({ ...machine, state: 'locked', keyMissing: !event.hasKey }, [])
          : result({ ...machine, state: 'uninitialized' }, [])
      }
      return result(machine, [])

    case 'uninitialized':
      if (event.type === 'VAULT_CREATED') {
        // The vault now exists natively either way; while backgrounded the
        // machine acknowledges it as `locked` — nothing unlocks out of sight,
        // and no dead `uninitialized`-with-a-vault state remains.
        return machine.foreground
          ? result({ ...machine, state: 'unlocked', authFailures: 0 }, ['START_IDLE_TIMER'])
          : result({ ...machine, state: 'locked' }, [])
      }
      return result(machine, [])

    case 'locked':
      switch (event.type) {
        case 'UNLOCK_REQUESTED':
          // A missing key or a backgrounded app never opens an auth prompt.
          if (machine.keyMissing || !machine.foreground) return result(machine, [])
          return result({ ...machine, state: 'unlocking', authAttempt: machine.authAttempt + 1 }, [
            'PROMPT_AUTH',
          ])
        case 'KEY_RESTORED':
          return result({ ...machine, keyMissing: false }, [])
        case 'APP_BACKGROUNDED':
          return result(machine, ['MASK_UI'])
        case 'APP_FOREGROUNDED':
          return result(machine, ['UNMASK_UI'])
        case 'VAULT_DESTROYED':
          return result(
            { ...machine, state: 'uninitialized', authFailures: 0, keyMissing: false },
            ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD'],
          )
        default:
          // AUTH_* without a pending attempt is fail-closed ignored.
          return result(machine, [])
      }

    case 'unlocking':
      switch (event.type) {
        case 'AUTH_SUCCEEDED':
          // Stale attempt ids and backgrounded completions are both ignored;
          // the host re-prompts when it returns to the foreground.
          if (event.attemptId !== machine.authAttempt || !machine.foreground) {
            return result(machine, [])
          }
          return result({ ...machine, state: 'unlocked', authFailures: 0 }, [
            'UNMASK_UI',
            'START_IDLE_TIMER',
          ])
        case 'AUTH_FAILED': {
          if (event.attemptId !== machine.authAttempt) return result(machine, [])
          const authFailures = machine.authFailures + 1
          return result(
            { ...machine, state: 'locked', authFailures },
            exceedsFailureLimit(authFailures, config) ? ['CLEAR_SECRET_CACHE'] : [],
          )
        }
        case 'APP_BACKGROUNDED':
          // The iOS biometric sheet fires an app-inactive signal; hosts must
          // map only REAL backgrounding here. Even if one slips through, no
          // unlock can be minted while `foreground` is false.
          return result(machine, [])
        case 'APP_FOREGROUNDED':
          // Any pending attempt is stale after a lifecycle transition: issue a
          // fresh prompt (short absence) or fall back to locked (long one) so
          // no auth completion from before the background can ever land.
          return withinBackgroundGrace(event.elapsedMs, config)
            ? result({ ...machine, authAttempt: machine.authAttempt + 1 }, ['PROMPT_AUTH'])
            : result({ ...machine, state: 'locked' }, ['CLEAR_SECRET_CACHE', 'UNMASK_UI'])
        case 'MANUAL_LOCK':
        case 'IDLE_TIMEOUT':
          return result({ ...machine, state: 'locked' }, ['CLEAR_SECRET_CACHE'])
        case 'VAULT_DESTROYED':
          return result(
            { ...machine, state: 'uninitialized', authFailures: 0, keyMissing: false },
            ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD'],
          )
        default:
          // HYDRATION_COMPLETE / VAULT_CREATED / UNLOCK_REQUESTED can never
          // mint an unlocked state from here.
          return result(machine, [])
      }

    case 'unlocked':
      switch (event.type) {
        case 'APP_BACKGROUNDED':
          // Secrets leave memory on suspend regardless of what the host UI
          // manages to do; the clipboard keeps its own owned-clear timer.
          return result({ ...machine, state: 'masked' }, [
            'MASK_UI',
            'CLEAR_SECRET_CACHE',
            'CANCEL_IDLE_TIMER',
          ])
        case 'APP_FOREGROUNDED':
          // Reached when an auth result landed while backgrounded (host bug or
          // sheet-blip mapping): the absence check still applies.
          return withinBackgroundGrace(event.elapsedMs, config)
            ? result(machine, [])
            : result({ ...machine, state: 'locked' }, ['CLEAR_SECRET_CACHE'])
        case 'USER_ACTIVITY':
          return result(machine, ['START_IDLE_TIMER'])
        case 'IDLE_TIMEOUT':
          return result({ ...machine, state: 'locked' }, [
            'CLEAR_SECRET_CACHE',
            'CANCEL_IDLE_TIMER',
          ])
        case 'MANUAL_LOCK':
          return result({ ...machine, state: 'locked' }, [
            'CLEAR_SECRET_CACHE',
            'WIPE_CLIPBOARD',
            'CANCEL_IDLE_TIMER',
          ])
        case 'VAULT_DESTROYED':
          return result(
            { ...machine, state: 'uninitialized', authFailures: 0, keyMissing: false },
            ['CLEAR_SECRET_CACHE', 'WIPE_CLIPBOARD', 'CANCEL_IDLE_TIMER'],
          )
        default:
          return result(machine, [])
      }

    case 'masked':
      switch (event.type) {
        case 'APP_FOREGROUNDED':
          // The grace path is only sound under the documented host contract
          // (native session outlives the grace window); invalid durations and
          // configs fall through to `locked`.
          return withinBackgroundGrace(event.elapsedMs, config)
            ? result({ ...machine, state: 'unlocked' }, ['UNMASK_UI', 'START_IDLE_TIMER'])
            : result({ ...machine, state: 'locked' }, ['UNMASK_UI'])
        case 'APP_BACKGROUNDED':
          return result(machine, [])
        case 'IDLE_TIMEOUT':
          return result({ ...machine, state: 'locked' }, [])
        case 'MANUAL_LOCK':
          return result({ ...machine, state: 'locked' }, ['WIPE_CLIPBOARD'])
        case 'VAULT_DESTROYED':
          return result(
            { ...machine, state: 'uninitialized', authFailures: 0, keyMissing: false },
            ['WIPE_CLIPBOARD'],
          )
        default:
          // AUTH_* / UNLOCK_REQUESTED / USER_ACTIVITY while masked are
          // fail-closed ignored.
          return result(machine, [])
      }
  }
}
