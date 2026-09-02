import {
  initialLockMachine,
  transition,
  type LockConfig,
  type LockEffect,
  type LockEvent,
  type LockMachine,
  type LockState,
} from '@yhtua/domain'
import { AppState, type AppStateStatus } from 'react-native'
import { wipeOwnedClipboard } from '../clipboard'
import { getCryptoPort } from '../ports'
import { clearSecretCache } from '../state/secret-cache'
import { ensureVaultHydrated, vaultStore } from '../state/vault-store'

// Mobile host for the shared lock machine — FULL ENFORCEMENT: the UI gates on
// the machine state (src/app/_layout.tsx renders the lock/mask screens).
//
// Zero-grace contract: until the native bridge keeps a key session alive
// across short backgrounds, backgroundLockMs is 0 — every real backgrounding
// requires re-authentication, matching the fail-closed native default.
const LOCK_CONFIG: LockConfig = {
  backgroundLockMs: 0,
  idleLockMs: 5 * 60_000,
  maxAuthFailures: 5,
}

type Listener = (state: LockState) => void

/** The lock machine's contract requires MONOTONIC elapsed durations: a wall
 * clock can be moved by the user or by NTP, which would let a long absence
 * look short. performance.now() is monotonic in Hermes. */
const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

let machine: LockMachine = initialLockMachine()
let idleTimer: ReturnType<typeof setTimeout> | undefined
let backgroundedAt: number | null = null
let started = false
const listeners = new Set<Listener>()

export const getLockState = (): LockState => machine.state
export const getAuthAttempt = (): number => machine.authAttempt

export const subscribeLockState = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = () => {
  for (const listener of listeners) listener(machine.state)
}

const executeEffects = (effects: LockEffect[]) => {
  for (const effect of effects) {
    switch (effect) {
      case 'CLEAR_SECRET_CACHE':
        clearSecretCache()
        break
      case 'START_IDLE_TIMER':
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => dispatch({ type: 'IDLE_TIMEOUT' }), LOCK_CONFIG.idleLockMs)
        break
      case 'CANCEL_IDLE_TIMER':
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = undefined
        break
      case 'WIPE_CLIPBOARD':
        // Fire-and-forget: locking must never wait on the pasteboard. The
        // OS-enforced expiration set at copy time is the backstop if this
        // never lands.
        void wipeOwnedClipboard()
        break
      case 'MASK_UI':
      case 'UNMASK_UI':
        // The layout renders the mask from the machine state directly; real
        // app-switcher snapshot masking is native (bridge phase).
        break
      case 'PROMPT_AUTH':
        // The lock screen triggers the actual prompt via requestUnlock().
        break
    }
  }
}

export const dispatch = (event: LockEvent) => {
  const outcome = transition(machine, event, LOCK_CONFIG)
  machine = outcome.machine
  executeEffects(outcome.effects)
  notify()
}

let unlockInFlight = false

/** Requests an unlock; in Expo Go the mock auth succeeds immediately. The
 * native bridge replaces the probe with the biometric-gated key fetch. */
export const requestUnlock = async () => {
  // Single-flight: repeated taps must never stack biometric prompts.
  if (unlockInFlight) return
  unlockInFlight = true
  try {
    dispatch({ type: 'UNLOCK_REQUESTED' })
    if (machine.state !== 'unlocking') return
    const attemptId = machine.authAttempt

    // Resolve the authenticator FIRST: only the ABSENCE of the native module
    // selects the dev-mock readiness probe. A native rejection (cancel,
    // failure) is a rejection — falling back there would be an unlock bypass.
    let nativeAuth: (() => Promise<boolean>) | null = null
    try {
      const { authenticateVault } = await import('../../modules/yhtua-vault')
      const pending = authenticateVault()
      if (pending) nativeAuth = () => pending
    } catch {
      nativeAuth = null
    }
    try {
      const granted = nativeAuth ? await nativeAuth() : await getCryptoPort().isEncryptionReady()
      dispatch(granted ? { type: 'AUTH_SUCCEEDED', attemptId } : { type: 'AUTH_FAILED', attemptId })
    } catch {
      dispatch({ type: 'AUTH_FAILED', attemptId })
    }
  } finally {
    unlockInFlight = false
  }
}

/** Two-step acknowledgment of the native privacy cover.
 *
 * `beginSafeFrame` reads the installed cover's generation while the layout is
 * committing; the returned function dismisses THAT generation once the frame
 * is on screen. A backgrounding in between raises a new cover with a new
 * number and the stale acknowledgment is refused.
 *
 * A transport failure retries with backoff: the cover blocks interaction, so
 * a single dropped call must not be able to strand the session behind it.
 * The retry re-reads the generation, so it can never uncover a newer cover —
 * there is deliberately no timeout that uncovers regardless.
 */
export const beginSafeFrame = async (): Promise<(() => Promise<void>) | null> => {
  let module: typeof import('../../modules/yhtua-vault')
  try {
    module = await import('../../modules/yhtua-vault')
  } catch {
    return null // No native module (Expo Go): there is no cover.
  }
  const pending = module.privacyCoverGeneration()
  if (!pending) return null
  let generation: number
  try {
    generation = await pending
  } catch {
    return null
  }

  const acknowledge = async (attempt = 0): Promise<void> => {
    try {
      await module.dismissPrivacyCover(generation)
    } catch {
      if (attempt >= MAX_ACKNOWLEDGE_ATTEMPTS) return
      const retry = await beginSafeFrame()
      setTimeout(() => void retry?.(), ACKNOWLEDGE_RETRY_MS * (attempt + 1))
    }
  }
  return () => acknowledge()
}

const MAX_ACKNOWLEDGE_ATTEMPTS = 5
const ACKNOWLEDGE_RETRY_MS = 250

const onAppStateChange = (status: AppStateStatus) => {
  // iOS fires 'inactive' for the biometric sheet, control-center pulls and the
  // app switcher, then 'active' again when they are dismissed. Only a RECORDED
  // real backgrounding may produce APP_FOREGROUNDED: under the zero-grace
  // config an unpaired 'active' would otherwise lock the app on every blip.
  if (status === 'background') {
    backgroundedAt = monotonicNow()
    dispatch({ type: 'APP_BACKGROUNDED' })
  } else if (status === 'active' && backgroundedAt !== null) {
    const elapsedMs = monotonicNow() - backgroundedAt
    backgroundedAt = null
    dispatch({ type: 'APP_FOREGROUNDED', elapsedMs })
  }
}

export const startLockHost = async () => {
  if (started) return
  started = true

  AppState.addEventListener('change', onAppStateChange)
  if (AppState.currentState === 'background') {
    backgroundedAt = monotonicNow()
    dispatch({ type: 'APP_BACKGROUNDED' })
  }

  const hydration = await ensureVaultHydrated()
  if (!hydration.ok) {
    // Storage failed or timed out: fail closed into locked-with-recovery
    // (hasVault true, hasKey false) rather than offering a fresh vault over
    // one that may merely be unreadable right now.
    dispatch({ type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: false })
    return
  }
  let hasKey = false
  try {
    hasKey = await getCryptoPort().isEncryptionReady()
  } catch {
    hasKey = false
  }
  // Tombstones alone still mean an INITIALIZED vault: a user who deleted every
  // token must not be handed a fresh unlocked vault on the next launch.
  const persisted = vaultStore.getState()
  const hasVault = persisted.tokens.length > 0 || persisted.tombstones.length > 0
  dispatch({ type: 'HYDRATION_COMPLETE', hasVault, hasKey })
}
