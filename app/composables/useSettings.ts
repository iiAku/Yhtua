import { open, save } from "@tauri-apps/plugin-dialog"
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { downloadDir, join } from "@tauri-apps/api/path"
import { z } from "zod"

const jsonCodec = <T extends z.core.$ZodType>(schema: T) =>
  z.codec(z.string(), schema, {
    decode: (jsonString, ctx) => {
      try {
        return JSON.parse(jsonString)
      } catch (err: unknown) {
        ctx.issues.push({
          code: "invalid_format",
          format: "json",
          input: jsonString,
          message: err instanceof Error ? err.message : "Invalid JSON",
        })
        return z.NEVER
      }
    },
    encode: (value) => JSON.stringify(value),
  })

export const exportTokens = async (notification: Ref<AppNotification>) => {
  try {
    const filename = "ythua_export_token.json"
    const downloadPath = await downloadDir()

    const saveFilePath = await save({
      defaultPath: await join(downloadPath, filename),
    })

    if (saveFilePath === null) {
      return
    }

    const backup = {
      version: "2.0.0",
      tokens: getTokens(),
    }

    // Now we can write the file to the disk
    await writeTextFile(saveFilePath, JSON.stringify(backup))
    await useShowNotification(notification, {
      text: "Tokens successfully exported",
      delay: 1500,
    })
  } catch (error) {
    await useShowNotification(notification, {
      text: "Error while exporting tokens",
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}

const importSchema = jsonCodec(exportImportSchema)

export const importTokens = async (notification: Ref<AppNotification>, navigateToHome?: boolean) => {
  try {
    const jsonPath = await open({
      multiple: false,
      filters: [
        {
          name: "json",
          extensions: ["json"],
        },
      ],
    })
    if (jsonPath === null) {
      return
    }
    const jsonContent = await readTextFile(jsonPath)

    const result = importSchema.safeParse(jsonContent)

    if (!result.success) {
      await useShowNotification(notification, {
        text: "Invalid token file",
        delay: 1500,
        type: NotificationType.Danger,
      })
      return
    }

    storeAddToken(result.data.tokens)

    await useShowNotification(notification, {
      text: "Tokens successfully imported",
      delay: 1500,
    })
    if (navigateToHome) {
      navigateTo("/")
    }
  } catch (err) {
    await useShowNotification(notification, {
      text: "Error while importing tokens",
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}

export const removeAllTokens = async (notification: Ref<AppNotification>) => {
  try {
    store.setState(defaultStore())
    await useShowNotification(notification, {
      text: "All tokens removed",
      delay: 1500,
    })
  } catch (error) {
    await useShowNotification(notification, {
      text: "Error while removing tokens",
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}
