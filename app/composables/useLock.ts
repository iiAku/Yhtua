import {
  initialLockMachine,
  transition,
  type LockConfig,
  type LockEffect,
  type LockEvent,
  type LockMachine,
} from '@yhtua/domain'
import { wipeOwnedClipboard } from './useClipboardRegistry'
import { bumpSecretEpoch } from './useSecretEpoch'
import { isEncryptionReady } from './useCrypto'
import { clearSecretCache } from './useOTP'
import { getTokens } from './useStore'

// Desktop adapter for the shared lock machine — REPORTING MODE ONLY. The
// desktop app has no unlock/auth surface yet, so the UI is never gated on the
// `locked` state (gating without a recovery path could lock users out of
// their own vault). What DOES run are the security effects: the secret cache
// is cleared on blur/idle exactly as the machine dictates, the owned
// clipboard is wiped where the machine says so, and desktop executes the same
// transitions the mobile client will enforce fully. The deviation from full
// enforcement is exactly one move: a `locked` state is immediately re-opened
// through UNLOCK_REQUESTED + AUTH_SUCCEEDED (vacuous auth), asserted as such
// by the adapter test.

const LOCK_CONFIG: LockConfig = {
  backgroundLockMs: 60_000,
  idleLockMs: 5 * 60_000,
  maxAuthFailures: 5,
}

const ACTIVITY_THROTTLE_MS = 30_000

let machine: LockMachine = initialLockMachine()
let idleTimer: ReturnType<typeof setTimeout> | undefined
let backgroundedAt: number | null = null
let lastActivityReport = 0
let started = false

export const getLockState = () => machine.state
export const getSecretEpoch = () => machine.secretEpoch

const executeEffects = (effects: LockEffect[]) => {
  for (const effect of effects) {
    switch (effect) {
      case 'CLEAR_SECRET_CACHE':
        bumpSecretEpoch()
        clearSecretCache()
        break
      case 'WIPE_CLIPBOARD':
        void wipeOwnedClipboard()
        break
      case 'START_IDLE_TIMER':
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => dispatch({ type: 'IDLE_TIMEOUT' }), LOCK_CONFIG.idleLockMs)
        break
      case 'CANCEL_IDLE_TIMER':
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = undefined
        break
      case 'MASK_UI':
      case 'UNMASK_UI':
      case 'PROMPT_AUTH':
        // Reporting mode: no lock UI on desktop yet.
        break
    }
  }
}

// Exported for the adapter test; not part of the app surface.
export const dispatch = (event: LockEvent) => {
  const outcome = transition(machine, event, LOCK_CONFIG)
  machine = outcome.machine
  executeEffects(outcome.effects)
  // Reporting-mode deviation: desktop has no auth adapter, so a locked
  // machine is immediately re-opened with a vacuous grant. Effects still run,
  // so cache hygiene is preserved; keyMissing still refuses this path.
  if (machine.state === 'locked' && machine.foreground && started) {
    const requested = transition(machine, { type: 'UNLOCK_REQUESTED' }, LOCK_CONFIG)
    machine = requested.machine
    executeEffects(requested.effects)
    if (machine.state === 'unlocking') {
      const granted = transition(
        machine,
        { type: 'AUTH_SUCCEEDED', attemptId: machine.authAttempt },
        LOCK_CONFIG,
      )
      machine = granted.machine
      executeEffects(granted.effects)
    }
  }
}

/** Reporting-mode hook for destructive vault operations (key reset, delete
 * all): runs the machine's destruction effects (cache + clipboard wipe, epoch
 * bump), then re-enters a fresh session since desktop stays usable. */
export const reportVaultDestroyed = () => {
  dispatch({ type: 'VAULT_DESTROYED' })
  dispatch({ type: 'VAULT_CREATED' })
}

export const startLockReporting = async () => {
  if (started || typeof window === 'undefined') return
  started = true

  // Lifecycle listeners come FIRST so nothing that happens during the async
  // hydration reads below is lost; the machine tracks foreground in every
  // state, including `hydrating`.
  window.addEventListener('blur', () => {
    backgroundedAt = performance.now()
    dispatch({ type: 'APP_BACKGROUNDED' })
  })
  window.addEventListener('focus', () => {
    const elapsedMs = backgroundedAt === null ? 0 : performance.now() - backgroundedAt
    backgroundedAt = null
    dispatch({ type: 'APP_FOREGROUNDED', elapsedMs })
  })
  if (!document.hasFocus()) {
    backgroundedAt = performance.now()
    dispatch({ type: 'APP_BACKGROUNDED' })
  }

  let hasKey = false
  try {
    hasKey = await isEncryptionReady()
  } catch {
    hasKey = false
  }
  const hasVault = getTokens().length > 0
  dispatch({ type: 'HYDRATION_COMPLETE', hasVault, hasKey })
  if (machine.state === 'uninitialized') {
    // Reporting mode: treat the running app as its own vault session.
    dispatch({ type: 'VAULT_CREATED' })
  }
  const reportActivity = () => {
    const now = performance.now()
    if (now - lastActivityReport < ACTIVITY_THROTTLE_MS) return
    lastActivityReport = now
    dispatch({ type: 'USER_ACTIVITY' })
  }
  window.addEventListener('pointerdown', reportActivity, { passive: true })
  window.addEventListener('keydown', reportActivity, { passive: true })
}
