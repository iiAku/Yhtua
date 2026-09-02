import { randomUUID } from 'expo-crypto'
import type { Token } from '@yhtua/domain'
import { dispatch, getLockState } from '../lock/host'
import { getCryptoPort } from '../ports'
import { getSecretEpoch } from './secret-cache'
import { addToken, updateToken } from './vault-store'

// The transactions that write a token at rest. Manual entry, QR scanning and
// editing all go through them, so a security rule added here cannot apply to
// one entry path and not the others.
//
// Encryption is a native round trip: on a device the vault can lock while it
// is in flight (backgrounding, idle timeout, an explicit lock). The lock
// authority is therefore re-checked at COMMIT time, not only at the start —
// the same secretEpoch guard the secret cache uses against stale decrypts.

export type NewTokenParameters = {
  issuer: string
  label: string
  algorithm: Token['otp']['algorithm']
  digits: number
  period: number
  secret: string
}

export type CreateTokenResult =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'duplicate' | 'failed'; message: string }

/** Writing is permitted while the vault is open, and during first-run before
 * a vault exists. Every other state — locked, unlocking, masked, hydrating —
 * must not gain a token. */
const WRITABLE = new Set(['unlocked', 'uninitialized'])

export const createToken = async (parameters: NewTokenParameters): Promise<CreateTokenResult> => {
  if (!WRITABLE.has(getLockState())) {
    return { ok: false, reason: 'locked', message: 'Unlock the vault first' }
  }
  const epochBefore = getSecretEpoch()

  let ciphertext: string
  try {
    const crypto = getCryptoPort()
    await crypto.ensureEncryptionKey()
    ciphertext = await crypto.encryptSecret(parameters.secret)
  } catch (cause) {
    return {
      ok: false,
      reason: 'failed',
      message: cause instanceof Error ? cause.message : 'Encryption failed',
    }
  }

  // The window between those two awaits is exactly where a lock can land.
  if (getSecretEpoch() !== epochBefore || !WRITABLE.has(getLockState())) {
    return { ok: false, reason: 'locked', message: 'The vault locked before this token was saved' }
  }

  const added = addToken({
    id: randomUUID(),
    updatedAt: Date.now(),
    otp: {
      issuer: parameters.issuer,
      label: parameters.label,
      algorithm: parameters.algorithm,
      digits: parameters.digits,
      period: parameters.period,
      secret: ciphertext,
      encrypted: true,
    },
  })
  if (!added) {
    return { ok: false, reason: 'duplicate', message: 'That token could not be added' }
  }

  // First token: the vault now exists, so background and idle locking engage.
  if (getLockState() === 'uninitialized') dispatch({ type: 'VAULT_CREATED' })
  return { ok: true }
}

/** Renames a token and OPTIONALLY replaces its secret. A replacement runs the
 * same encryption round trip as a creation, so it carries the same
 * commit-time lock check. */
export const editToken = async (
  id: string,
  changes: { label: string; secret?: string },
): Promise<CreateTokenResult> => {
  if (!WRITABLE.has(getLockState())) {
    return { ok: false, reason: 'locked', message: 'Unlock the vault first' }
  }
  const epochBefore = getSecretEpoch()

  let ciphertext: string | undefined
  if (changes.secret !== undefined) {
    try {
      ciphertext = await getCryptoPort().encryptSecret(changes.secret)
    } catch (cause) {
      return {
        ok: false,
        reason: 'failed',
        message: cause instanceof Error ? cause.message : 'Encryption failed',
      }
    }
    if (getSecretEpoch() !== epochBefore || !WRITABLE.has(getLockState())) {
      return { ok: false, reason: 'locked', message: 'The vault locked before this edit was saved' }
    }
  }

  if (!updateToken(id, { label: changes.label, secret: ciphertext })) {
    return { ok: false, reason: 'failed', message: 'The token could not be updated' }
  }
  return { ok: true }
}
