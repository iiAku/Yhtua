import { z } from 'zod'
import { parseBoundedJson } from './bounded-json'
import { MAX_ENCRYPTED_BACKUP_BYTES } from './schema'

const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

// The envelope is unauthenticated metadata — only `data` is bound to the password
// by AEAD. So any file that merely looks encrypted earns a decryption attempt,
// and the strict validation that guards the store runs on the decrypted payload.
// Not .strict(): pre-2.7.1 backups carry a vestigial `hmac` key, and rejecting
// them outright sent an encrypted file to the plaintext parser, which then
// reported a nonsense error instead of asking for the password.
// Sync binds envelope metadata to the payload separately (syncBackupSchema below
// plus portableBackupMetadataMatches) because it acts on `syncedAt`; a manual
// import reads nothing but `data`.
export const encryptedEnvelopeSchema = z.object({
  version: z.string().max(32).optional(),
  encrypted: z.literal(true),
  syncedAt: timestampSchema.optional(),
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

export type EncryptedExport = z.infer<typeof encryptedEnvelopeSchema>

// Deliberately not .strict(): backups written before 2.7.1 carry a vestigial
// `hmac` field, and rejecting the whole file over a key we no longer read makes
// an existing remote backup permanently unreadable. Unknown keys are stripped,
// so a rewrite drops them. The fields we act on are still validated here and
// cross-checked against the authenticated payload by portableBackupMetadataMatches.
export const syncBackupSchema = z.object({
  version: z.enum(['2.2.0', '2.3.0']),
  encrypted: z.literal(true),
  syncedAt: timestampSchema,
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

export const parseAndValidate = <T extends z.ZodType>(
  jsonString: string,
  schema: T,
  maxBytes?: number,
) => {
  try {
    const parsed = parseBoundedJson(jsonString, maxBytes)
    return schema.safeParse(parsed)
  } catch {
    return schema.safeParse(undefined)
  }
}

// Zod issues carry the field path and rule, never the value — safe to show.
export const describeIssues = (error: z.ZodError | undefined): string => {
  const issue = error?.issues[0]
  if (!issue) return 'Invalid token file format'
  const field = issue.path.join('.')
  return field ? `Invalid backup: ${field} — ${issue.message}` : `Invalid backup: ${issue.message}`
}

// A rejected platform call may yield a serialized error as a plain string, not
// an Error — so `instanceof Error` alone silently swallowed every reason the OS
// gave us ("Encryption key is missing", "Secure credential storage is
// unavailable") and replaced it with a generic fallback.
export const describeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

// Every import/export path returns one of these instead of notifying itself, so
// the caller decides where feedback belongs — inline in the modal for failures
// the user can act on, a toast once the modal is gone.
export type BackupResult = {
  success: boolean
  cancelled?: boolean
  error?: string
  tokensCount?: number
  legacy?: boolean
  needsPassword?: boolean
}
