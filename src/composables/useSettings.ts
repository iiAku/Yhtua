import { BaseDirectory, readTextFile, writeTextFile } from "@tauri-apps/api/fs"

import { open } from "@tauri-apps/api/dialog"
import { save } from "@tauri-apps/api/dialog"

export const exportTokens = async (notification: Notification) => {
  try {
    const filename = "ythua_export_token.json"

    const saveFilePath = await save({
      defaultPath: BaseDirectory.Download + "/" + filename,
    })

    if (saveFilePath === null) {
      return
    }

    const backup = {
      version: "1.0.1",
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

export const importTokens = async (notification: Notification, navigateToHome?: boolean) => {
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
    const jsonContent = await readTextFile(jsonPath as string)
    const parsedFile = JSON.parse(jsonContent)
    const parsed = exportImportSchema.parse(parsedFile)

    storeAddToken(parsed.tokens)

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