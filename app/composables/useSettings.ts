import { downloadDir, join } from '@tauri-apps/api/path'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { z } from 'zod'
import {
  decryptSecret,
  decryptWithPassword,
  encryptSecret,
  encryptWithPassword,
  initializeEncryption,
} from './useCrypto'

const encryptedExportSchema = z.object({
  version: z.string(),
  encrypted: z.literal(true),
  data: z.string(),
})

const parseAndValidate = <T extends z.ZodType>(
  jsonString: string,
  schema: T,
): z.SafeParseReturnType<unknown, z.infer<T>> => {
  try {
    const parsed = JSON.parse(jsonString)
    return schema.safeParse(parsed)
  } catch (err) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: [],
          message: err instanceof Error ? err.message : 'Invalid JSON',
        },
      ]),
    } as z.SafeParseReturnType<unknown, z.infer<T>>
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
    const filename = 'yhtua_backup.json'
    const downloadPath = await downloadDir()

    const saveFilePath = await save({
      defaultPath: await join(downloadPath, filename),
    })

    if (saveFilePath === null) {
      return false
    }

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
      version: '2.1.0',
      encrypted: false,
      tokens: decryptedTokens,
    }

    const encryptedData = await encryptWithPassword(JSON.stringify(backupData), password)

    const encryptedBackup = {
      version: '2.1.0',
      encrypted: true,
      data: encryptedData,
    }

    await writeTextFile(saveFilePath, JSON.stringify(encryptedBackup))
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
    const jsonPath = await open({
      multiple: false,
      filters: [
        {
          name: 'json',
          extensions: ['json'],
        },
      ],
    })

    if (jsonPath === null) {
      return false
    }

    const jsonContent = await readTextFile(jsonPath)

    const encryptedResult = parseAndValidate(jsonContent, encryptedExportSchema)

    if (encryptedResult.success) {
      try {
        const decryptedJson = await decryptWithPassword(encryptedResult.data.data, password)
        const decryptedData = JSON.parse(decryptedJson)

        const validationResult = exportImportSchema.safeParse(decryptedData)
        if (!validationResult.success) {
          await useShowNotification(notification, {
            text: 'Invalid backup data structure',
            delay: 2000,
            type: NotificationType.Danger,
          })
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

        storeAddToken(reEncryptedTokens)

        await useShowNotification(notification, {
          text: `${reEncryptedTokens.length} tokens imported`,
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

    const legacyResult = parseAndValidate(jsonContent, exportImportSchema)

    if (legacyResult.success) {
      await initializeEncryption()

      const reEncryptedTokens = await Promise.all(
        legacyResult.data.tokens.map(async (token: Token) => ({
          ...token,
          otp: {
            ...token.otp,
            secret: token.otp.encrypted ? token.otp.secret : await encryptSecret(token.otp.secret),
            encrypted: true,
          },
        })),
      )

      storeAddToken(reEncryptedTokens)

      await useShowNotification(notification, {
        text: `${reEncryptedTokens.length} tokens imported (legacy format)`,
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

export const exportTokens = async (notification: Ref<AppNotification>) => {
  try {
    const filename = 'yhtua_export_token.json'
    const downloadPath = await downloadDir()

    const saveFilePath = await save({
      defaultPath: await join(downloadPath, filename),
    })

    if (saveFilePath === null) {
      return
    }

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

    const backup = {
      version: '2.0.0',
      tokens: decryptedTokens,
    }

    await writeTextFile(saveFilePath, JSON.stringify(backup))
    await useShowNotification(notification, {
      text: 'Tokens exported (unencrypted)',
      delay: 1500,
    })
  } catch (error) {
    await useShowNotification(notification, {
      text: 'Error while exporting tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}

export const importTokens = async (
  notification: Ref<AppNotification>,
  navigateToHome?: boolean,
) => {
  try {
    const jsonPath = await open({
      multiple: false,
      filters: [
        {
          name: 'json',
          extensions: ['json'],
        },
      ],
    })
    if (jsonPath === null) {
      return
    }
    const jsonContent = await readTextFile(jsonPath)

    const result = parseAndValidate(jsonContent, exportImportSchema)

    if (!result.success) {
      console.error('Import validation error:', result.error.issues)
      await useShowNotification(notification, {
        text: 'Invalid token file format',
        delay: 1500,
        type: NotificationType.Danger,
      })
      return
    }

    await initializeEncryption()

    const reEncryptedTokens = await Promise.all(
      result.data.tokens.map(async (token: Token) => {
        try {
          const encryptedSecret = token.otp.encrypted
            ? token.otp.secret
            : await encryptSecret(token.otp.secret)
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

    storeAddToken(reEncryptedTokens)

    await useShowNotification(notification, {
      text: `${reEncryptedTokens.length} tokens imported`,
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
    store.setState(defaultStore())
    await useShowNotification(notification, {
      text: 'All tokens removed',
      delay: 1500,
    })
  } catch (error) {
    await useShowNotification(notification, {
      text: 'Error while removing tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}
