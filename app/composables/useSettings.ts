import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { MAX_ENCRYPTED_BACKUP_BYTES } from './useStore'
import {
  decryptSecret,
  decryptWithPassword,
  encryptSecret,
  encryptWithPassword,
  initializeEncryption,
} from './useCrypto'

const encryptedExportSchema = z
  .object({
    version: z.enum(['2.0.0', '2.1.0', '2.2.0', '2.3.0']),
    encrypted: z.literal(true),
    syncedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
  })
  .strict()

const parseAndValidate = <T extends z.ZodType>(
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

const pickBackupFile = (): Promise<string | null> => invoke<string | null>('pick_backup_file')

const saveBackupFile = (content: string): Promise<boolean> =>
  invoke<boolean>('save_backup_file', { content })

type EncryptedExport = z.infer<typeof encryptedExportSchema>

let pendingEncryptedBackup: EncryptedExport | null = null

export const hasPendingEncryptedImport = (): boolean => pendingEncryptedBackup !== null

export const clearPendingEncryptedImport = (): void => {
  pendingEncryptedBackup = null
}

export const completePendingEncryptedImport = async (
  password: string,
): Promise<{ success: boolean; cancelled?: boolean; error?: string; tokensCount?: number }> => {
  const pending = pendingEncryptedBackup
  if (!pending) return { success: false, error: 'No pending import' }

  let decryptedData: unknown
  try {
    const decryptedJson = await decryptWithPassword(pending.data, password)
    decryptedData = parseBoundedJson(decryptedJson)
  } catch {
    return { success: false, error: 'Wrong password or corrupted file' }
  }

  const validationResult = plaintextBackupSchema.safeParse(decryptedData)
  if (!validationResult.success || !portableBackupMetadataMatches(pending, validationResult.data)) {
    return { success: false, error: 'Invalid backup data structure' }
  }

  const tokenCount = validationResult.data.tokens.length
  const existingCount = getTokens().length
  if (
    existingCount > 0 &&
    !confirm(`Import ${tokenCount} tokens? You currently have ${existingCount} tokens.`)
  ) {
    return { success: false, cancelled: true }
  }

  try {
    await initializeEncryption()

    const reEncryptedTokens = await Promise.all(
      validationResult.data.tokens.map(async (token: Token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    const importedCount = storeAddToken(reEncryptedTokens)
    if (pendingEncryptedBackup === pending) pendingEncryptedBackup = null

    return { success: true, tokensCount: importedCount }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Encryption error',
    }
  }
}

const getPlaintextSecret = async (token: Token): Promise<string> => {
  if (token.otp.encrypted) {
    return await decryptSecret(token.otp.secret)
  }
  return token.otp.secret
}

export const exportTokensEncrypted = async (
  notification: Ref<AppNotification>,
  password: string,
): Promise<boolean> => {
  try {
    const tokens = getTokens()
    const decryptedTokens = await Promise.all(
      tokens.map(async (token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await getPlaintextSecret(token),
          encrypted: false,
        },
      })),
    )

    const backupData = {
      version: '2.3.0',
      encrypted: false,
      tokens: decryptedTokens,
      tombstones: getTombstones(),
    }

    const encryptedData = await encryptWithPassword(JSON.stringify(backupData), password)

    const encryptedBackup = {
      version: '2.3.0',
      encrypted: true,
      data: encryptedData,
    }

    if (!(await saveBackupFile(JSON.stringify(encryptedBackup, null, 2)))) {
      return false
    }
    await useShowNotification(notification, {
      text: 'Tokens exported with encryption',
      delay: 1500,
    })
    return true
  } catch (error) {
    console.error('Export error:', error)
    await useShowNotification(notification, {
      text: 'Error while exporting tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
    return false
  }
}

export const importTokensEncrypted = async (
  notification: Ref<AppNotification>,
  password: string,
  navigateToHome?: boolean,
): Promise<boolean> => {
  try {
    const jsonContent = await pickBackupFile()
    if (jsonContent === null) {
      return false
    }

    const encryptedResult = parseAndValidate(
      jsonContent,
      encryptedExportSchema,
      MAX_ENCRYPTED_BACKUP_BYTES,
    )

    if (encryptedResult.success) {
      try {
        const decryptedJson = await decryptWithPassword(encryptedResult.data.data, password)
        const decryptedData = parseBoundedJson(decryptedJson)

        const validationResult = plaintextBackupSchema.safeParse(decryptedData)
        if (
          !validationResult.success ||
          !portableBackupMetadataMatches(encryptedResult.data, validationResult.data)
        ) {
          await useShowNotification(notification, {
            text: 'Invalid backup data structure',
            delay: 2000,
            type: NotificationType.Danger,
          })
          return false
        }

        const tokenCount = validationResult.data.tokens.length
        const existingCount = getTokens().length
        if (
          existingCount > 0 &&
          !confirm(`Import ${tokenCount} tokens? You currently have ${existingCount} tokens.`)
        ) {
          return false
        }

        await initializeEncryption()

        const reEncryptedTokens = await Promise.all(
          validationResult.data.tokens.map(async (token: Token) => ({
            ...token,
            otp: {
              ...token.otp,
              secret: await encryptSecret(token.otp.secret),
              encrypted: true,
            },
          })),
        )

        const importedCount = storeAddToken(reEncryptedTokens)

        await useShowNotification(notification, {
          text: `${importedCount} tokens imported`,
          delay: 1500,
        })

        if (navigateToHome) {
          navigateTo('/')
        }
        return true
      } catch {
        await useShowNotification(notification, {
          text: 'Wrong password or corrupted file',
          delay: 2000,
          type: NotificationType.Danger,
        })
        return false
      }
    }

    const legacyResult = parseAndValidate(jsonContent, plaintextBackupSchema)

    if (legacyResult.success) {
      const tokenCount = legacyResult.data.tokens.length
      const existingCount = getTokens().length
      if (
        existingCount > 0 &&
        !confirm(`Import ${tokenCount} tokens? You currently have ${existingCount} tokens.`)
      ) {
        return false
      }

      await initializeEncryption()

      const reEncryptedTokens = await Promise.all(
        legacyResult.data.tokens.map(async (token: Token) => ({
          ...token,
          otp: {
            ...token.otp,
            secret: await encryptSecret(token.otp.secret),
            encrypted: true,
          },
        })),
      )

      const importedCount = storeAddToken(reEncryptedTokens)

      await useShowNotification(notification, {
        text: `${importedCount} tokens imported (legacy format)`,
        delay: 1500,
      })

      if (navigateToHome) {
        navigateTo('/')
      }
      return true
    }

    console.error('Import validation error:', legacyResult.error?.issues)
    await useShowNotification(notification, {
      text: 'Invalid token file format',
      delay: 1500,
      type: NotificationType.Danger,
    })
    return false
  } catch (err) {
    console.error('Import error:', err)
    await useShowNotification(notification, {
      text: 'Error while importing tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
    return false
  }
}

export const importTokens = async (
  notification: Ref<AppNotification>,
  navigateToHome?: boolean,
) => {
  try {
    const jsonContent = await pickBackupFile()
    if (jsonContent === null) {
      return
    }

    // Detect encrypted backup (sync or export) — return for caller to handle password
    const encryptedResult = parseAndValidate(
      jsonContent,
      encryptedExportSchema,
      MAX_ENCRYPTED_BACKUP_BYTES,
    )
    if (encryptedResult.success) {
      pendingEncryptedBackup = encryptedResult.data
      return
    }

    // Unencrypted backup
    const result = parseAndValidate(jsonContent, plaintextBackupSchema)

    if (!result.success) {
      console.error('Import validation error:', result.error.issues)
      await useShowNotification(notification, {
        text: 'Invalid token file format',
        delay: 1500,
        type: NotificationType.Danger,
      })
      return
    }

    const tokenCount = result.data.tokens.length
    const existingCount = getTokens().length
    if (
      existingCount > 0 &&
      !confirm(`Import ${tokenCount} tokens? You currently have ${existingCount} tokens.`)
    ) {
      return
    }

    await initializeEncryption()

    const reEncryptedTokens = await Promise.all(
      result.data.tokens.map(async (token: Token) => {
        try {
          const encryptedSecret = await encryptSecret(token.otp.secret)
          return {
            ...token,
            otp: {
              ...token.otp,
              secret: encryptedSecret,
              encrypted: true,
            },
          }
        } catch (encryptError) {
          console.error(`Failed to encrypt token ${token.id}:`, encryptError)
          throw encryptError
        }
      }),
    )

    const importedCount = storeAddToken(reEncryptedTokens)

    await useShowNotification(notification, {
      text: `${importedCount} tokens imported`,
      delay: 1500,
    })
    if (navigateToHome) {
      navigateTo('/')
    }
  } catch (err) {
    console.error('Import error:', err)
    await useShowNotification(notification, {
      text: 'Error while importing tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}

export const removeAllTokens = async (notification: Ref<AppNotification>) => {
  try {
    storeDeleteAllTokens()
    await useShowNotification(notification, {
      text: 'All tokens removed',
      delay: 1500,
    })
  } catch {
    await useShowNotification(notification, {
      text: 'Error while removing tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}
