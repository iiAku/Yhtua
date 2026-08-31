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
        // Sensitive clipboard handling (UIPasteboard localOnly + expiration)
        // arrives with the native module in the bridge phase.
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

const onAppStateChange = (status: AppStateStatus) => {
  // iOS fires 'inactive' for the biometric sheet and control-center pulls;
  // only 'background' is a real backgrounding. The machine additionally
  // protects itself even if this mapping is wrong.
  if (status === 'background') {
    backgroundedAt = Date.now()
    dispatch({ type: 'APP_BACKGROUNDED' })
  } else if (status === 'active') {
    const elapsedMs = backgroundedAt === null ? 0 : Date.now() - backgroundedAt
    backgroundedAt = null
    dispatch({ type: 'APP_FOREGROUNDED', elapsedMs })
  }
}

export const startLockHost = async () => {
  if (started) return
  started = true

  AppState.addEventListener('change', onAppStateChange)
  if (AppState.currentState === 'background') {
    backgroundedAt = Date.now()
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
  const hasVault = vaultStore.getState().tokens.length > 0
  dispatch({ type: 'HYDRATION_COMPLETE', hasVault, hasKey })
}
