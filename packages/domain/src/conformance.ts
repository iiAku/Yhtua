// Cross-client conformance scenarios. Every Yhtua client (desktop Vue app,
// mobile React Native app) runs these identical scenarios in its own test
// suite and runtime, so security-relevant behavior cannot silently diverge
// between clients. Add a scenario here whenever a rule is worth locking in;
// never fork per-client copies.

import {
  initialLockMachine,
  transition,
  type LockConfig,
  type LockEffect,
  type LockEvent,
  type LockState,
} from './lock/machine'
import { mergeTokens, type MergeResult } from './merge'
import { plaintextBackupSchema, type Token, type Tombstone } from './schema'
import { encryptedEnvelopeSchema } from './transfer-policy'

const makeToken = (id: string, label: string, updatedAt: number, lastUsed?: number): Token => ({
  id,
  updatedAt,
  ...(lastUsed === undefined ? {} : { lastUsed }),
  otp: {
    issuer: 'Example',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: 'JBSWY3DPEHPK3PXP',
    encrypted: false,
  },
})

export type MergeScenario = {
  name: string
  input: {
    localTokens: Token[]
    localTombstones: Tombstone[]
    remoteTokens: Token[]
    remoteTombstones: Tombstone[]
  }
  expected: MergeResult
}

export const mergeScenarios: MergeScenario[] = [
  {
    name: 'newest token wins; remote wins an exact timestamp tie',
    input: {
      localTokens: [makeToken('same', 'local', 10)],
      remoteTokens: [makeToken('same', 'remote', 10)],
      localTombstones: [],
      remoteTombstones: [],
    },
    expected: { tokens: [makeToken('same', 'remote', 10)], tombstones: [] },
  },
  {
    name: 'usage ordering merges independently from content timestamps',
    input: {
      localTokens: [makeToken('same', 'older content', 10, 100)],
      remoteTokens: [makeToken('same', 'newer content', 20, 50)],
      localTombstones: [],
      remoteTombstones: [],
    },
    expected: { tokens: [makeToken('same', 'newer content', 20, 100)], tombstones: [] },
  },
  {
    name: 'a deletion newer than the token removes it; an older one is superseded',
    input: {
      localTokens: [makeToken('deleted', 'Deleted', 1), makeToken('restored', 'Restored', 11)],
      remoteTokens: [],
      localTombstones: [
        { id: 'deleted', deletedAt: 10 },
        { id: 'restored', deletedAt: 10 },
      ],
      remoteTombstones: [],
    },
    expected: {
      tokens: [makeToken('restored', 'Restored', 11)],
      tombstones: [{ id: 'deleted', deletedAt: 10 }],
    },
  },
]

/** Runs one merge scenario; returns the actual result for the client's test to
 * compare against `scenario.expected`. */
export const evaluateMergeScenario = (scenario: MergeScenario): MergeResult =>
  mergeTokens(scenario.input)

export type ImportPolicyScenario = {
  name: string
  payload: unknown
  /** encrypted → route to password decryption; plaintext → parse as a plain
   * backup; rejected → refuse the file. */
  expected: 'encrypted' | 'plaintext' | 'rejected'
}

export const importPolicyScenarios: ImportPolicyScenario[] = [
  {
    name: 'pre-2.7.1 envelope with vestigial hmac routes to decryption',
    payload: { version: '2.2.0', encrypted: true, syncedAt: 1, data: 'x', hmac: 'y' },
    expected: 'encrypted',
  },
  {
    name: 'unknown future version still routes to decryption',
    payload: { version: '9.9.9', encrypted: true, data: 'x' },
    expected: 'encrypted',
  },
  {
    name: 'plaintext v1 backup parses as plaintext',
    payload: {
      version: '1.0',
      tokens: [{ id: 'legacy-1', otp: { label: 'bob', secret: 'JBSWY3DPEHPK3PXP' } }],
    },
    expected: 'plaintext',
  },
  {
    name: 'device-bound ciphertext in a portable backup is rejected',
    payload: {
      version: '2.3.0',
      encrypted: false,
      tokens: [
        {
          id: 't',
          otp: { label: 'a', secret: 'ciphertext', encrypted: true },
        },
      ],
    },
    expected: 'rejected',
  },
  {
    name: 'an empty encrypted payload is rejected',
    payload: { encrypted: true, data: '' },
    expected: 'rejected',
  },
]

/** The routing rule every client's import flow must follow. */
export const classifyImportPayload = (payload: unknown): 'encrypted' | 'plaintext' | 'rejected' => {
  if (encryptedEnvelopeSchema.safeParse(payload).success) return 'encrypted'
  if (plaintextBackupSchema.safeParse(payload).success) return 'plaintext'
  return 'rejected'
}

export type LockScenario = {
  name: string
  config: LockConfig
  events: LockEvent[]
  expectedState: LockState
  /** The exact ordered effect sequence across the whole event sequence. */
  expectedEffects: LockEffect[]
}

const lockConfig: LockConfig = { backgroundLockMs: 60_000, idleLockMs: 300_000, maxAuthFailures: 5 }

export const lockScenarios: LockScenario[] = [
  {
    name: 'unlock, background past the limit, foreground: locked with cache cleared',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'AUTH_SUCCEEDED', attemptId: 1 },
      { type: 'APP_BACKGROUNDED' },
      { type: 'APP_FOREGROUNDED', elapsedMs: 61_000 },
    ],
    expectedState: 'locked',
    expectedEffects: [
      'PROMPT_AUTH',
      'UNMASK_UI',
      'START_IDLE_TIMER',
      'MASK_UI',
      'CLEAR_SECRET_CACHE',
      'CANCEL_IDLE_TIMER',
      'UNMASK_UI',
    ],
  },
  {
    name: 'an auth success that lands while backgrounded never unlocks',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'APP_BACKGROUNDED' },
      { type: 'AUTH_SUCCEEDED', attemptId: 1 },
      { type: 'APP_FOREGROUNDED', elapsedMs: 61_000 },
    ],
    expectedState: 'locked',
    expectedEffects: ['PROMPT_AUTH', 'CLEAR_SECRET_CACHE', 'UNMASK_UI'],
  },
  {
    name: 'a short background keeps the session but still clears the secret cache',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'AUTH_SUCCEEDED', attemptId: 1 },
      { type: 'APP_BACKGROUNDED' },
      { type: 'APP_FOREGROUNDED', elapsedMs: 5_000 },
    ],
    expectedState: 'unlocked',
    expectedEffects: [
      'PROMPT_AUTH',
      'UNMASK_UI',
      'START_IDLE_TIMER',
      'MASK_UI',
      'CLEAR_SECRET_CACHE',
      'CANCEL_IDLE_TIMER',
      'UNMASK_UI',
      'START_IDLE_TIMER',
    ],
  },
  {
    name: 'ciphertext without a key hydrates to locked and refuses ordinary unlocking',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: false },
      { type: 'UNLOCK_REQUESTED' },
    ],
    expectedState: 'locked',
    expectedEffects: [],
  },
  {
    name: 'a stale auth completion is ignored',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'AUTH_SUCCEEDED', attemptId: 99 },
    ],
    expectedState: 'unlocking',
    expectedEffects: ['PROMPT_AUTH'],
  },
  {
    name: 'destroying the vault wipes secrets and clipboard from any session',
    config: lockConfig,
    events: [
      { type: 'HYDRATION_COMPLETE', hasVault: true, hasKey: true },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'AUTH_SUCCEEDED', attemptId: 1 },
      { type: 'VAULT_DESTROYED' },
    ],
    expectedState: 'uninitialized',
    expectedEffects: [
      'PROMPT_AUTH',
      'UNMASK_UI',
      'START_IDLE_TIMER',
      'CLEAR_SECRET_CACHE',
      'WIPE_CLIPBOARD',
      'CANCEL_IDLE_TIMER',
    ],
  },
]

export const evaluateLockScenario = (
  scenario: LockScenario,
): { state: LockState; effects: LockEffect[] } => {
  let machine = initialLockMachine()
  const effects: LockEffect[] = []
  for (const event of scenario.events) {
    const outcome = transition(machine, event, scenario.config)
    machine = outcome.machine
    effects.push(...outcome.effects)
  }
  return { state: machine.state, effects }
}
