import {
  describeIssues,
  MAX_ENCRYPTED_BACKUP_BYTES,
  mergeTokens,
  parseAndValidate,
  parseBoundedJson,
  plaintextBackupSchema,
  encryptedEnvelopeSchema,
  type BackupResult,
  type Token,
} from '@yhtua/domain'
import { getLockState } from '../lock/host'
import { getCryptoPort } from '../ports'
import { getSecretEpoch } from '../state/secret-cache'
import { parseAtRestToken, replaceVault, vaultStore } from '../state/vault-store'

// YHP2 import/export — the ONLY desktop<->mobile migration path. The binary
// envelope is parsed exclusively by Rust (via the crypto port); this module
// owns the JSON policy layer, shared with desktop through @yhtua/domain.
// File picking/sharing are thin adapters injected by the screens (they need
// native modules); everything below is pure enough to test under node.

export const importBackupContent = async (
  jsonContent: string,
  password: string,
): Promise<BackupResult> => {
  if (getLockState() !== 'unlocked') {
    return { success: false, error: 'Unlock the vault before importing' }
  }
  const epochAtStart = getSecretEpoch()
  const envelope = parseAndValidate(
    jsonContent,
    encryptedEnvelopeSchema,
    MAX_ENCRYPTED_BACKUP_BYTES,
  )
  if (!envelope.success) {
    // Mobile v1 imports encrypted backups only: plaintext files would put
    // decrypted secrets through JS with no need — desktop can convert.
    const plain = parseAndValidate(jsonContent, plaintextBackupSchema)
    if (plain.success) {
      return {
        success: false,
        error: 'Plaintext backups are not supported on mobile — export an encrypted backup',
      }
    }
    return { success: false, error: describeIssues(plain.error) }
  }

  let decrypted: unknown
  try {
    decrypted = parseBoundedJson(
      await getCryptoPort().decryptWithPassword(envelope.data.data, password),
    )
  } catch {
    return { success: false, error: 'Wrong password or corrupted file' }
  }

  const payload = plaintextBackupSchema.safeParse(decrypted)
  if (!payload.success) {
    return { success: false, error: describeIssues(payload.error) }
  }

  // Encrypt every secret with the device key BEFORE anything reaches state.
  const crypto = getCryptoPort()
  await crypto.ensureEncryptionKey()
  const now = Date.now()
  const encrypted: Token[] = []
  for (const token of payload.data.tokens) {
    const ciphertext = await crypto.encryptSecret(token.otp.secret)
    const candidate: Token = {
      ...token,
      updatedAt: token.updatedAt ?? now,
      otp: { ...token.otp, secret: ciphertext, encrypted: true },
    }
    if (parseAtRestToken(candidate)) encrypted.push(candidate)
  }

  if (getSecretEpoch() !== epochAtStart) {
    // The lock machine cleared the secret session mid-import (backgrounding,
    // manual lock): refuse the commit rather than mutating a locked vault.
    return { success: false, error: 'The vault locked during the import — try again' }
  }
  const state = vaultStore.getState()
  const merged = mergeTokens({
    localTokens: state.tokens,
    localTombstones: state.tombstones,
    remoteTokens: encrypted,
    remoteTombstones: payload.data.tombstones,
  })
  replaceVault(merged.tokens, merged.tombstones)
  return { success: true, tokensCount: encrypted.length }
}

export const exportBackupContent = async (password: string): Promise<string> => {
  if (getLockState() !== 'unlocked') {
    throw new Error('Unlock the vault before exporting')
  }
  const epochAtStart = getSecretEpoch()
  const crypto = getCryptoPort()
  const state = vaultStore.getState()
  // Batch decryption keeps the export to ONE biometric checkpoint when the
  // native module is present; the per-secret loop is the dev-mock fallback.
  const encryptedSecrets = state.tokens
    .filter((token) => token.otp.encrypted)
    .map((token) => token.otp.secret)
  const decryptedByCiphertext = new Map<string, string>()
  if (encryptedSecrets.length > 0) {
    let batch: Promise<string[]> | null = null
    try {
      const { decryptSecretsBatch } = await import('../../modules/yhtua-vault')
      batch = decryptSecretsBatch(encryptedSecrets)
    } catch {
      // No native module in this runtime (Expo Go, tests): the per-secret
      // path below serves the dev mock.
      batch = null
    }
    if (batch) {
      // A cancellation or failure aborts the WHOLE export — retrying secret
      // by secret would raise one biometric prompt per token.
      const plaintexts = await batch
      encryptedSecrets.forEach((ciphertext, index) => {
        const plaintext = plaintexts[index]
        if (plaintext !== undefined) decryptedByCiphertext.set(ciphertext, plaintext)
      })
    }
  }
  const decryptedTokens: Token[] = []
  for (const token of state.tokens) {
    const secret = token.otp.encrypted
      ? (decryptedByCiphertext.get(token.otp.secret) ??
        (await crypto.decryptSecret(token.otp.secret)))
      : token.otp.secret
    decryptedTokens.push({
      ...token,
      otp: { ...token.otp, secret, encrypted: false },
    })
  }
  const payload = {
    version: '2.3.0',
    encrypted: false,
    tokens: decryptedTokens,
    tombstones: state.tombstones,
  }
  if (getSecretEpoch() !== epochAtStart) {
    throw new Error('The vault locked during the export — try again')
  }
  const data = await crypto.encryptWithPassword(JSON.stringify(payload), password)
  // The password encryption itself can span a lock: re-check before the
  // result (which embeds decrypted secrets) is delivered anywhere.
  if (getSecretEpoch() !== epochAtStart) {
    throw new Error('The vault locked during the export — try again')
  }
  return JSON.stringify({ version: '2.3.0', encrypted: true, data }, null, 2)
}
