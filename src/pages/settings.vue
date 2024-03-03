<template>
  <div class="bg-gray-900 h-screen overflow-auto">
    <Navbar />
    <div class="relative isolate overflow-hidden px-6 py-24">
      <h2
        class="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-white"
      >
        Yhtua Settings
      </h2>

      <div class="flex-col w-full my-6 px-8">
        <SettingList :settings="settings" />
        <Notification
          :text="notification.text"
          :type="notification.type"
          v-if="notification.show"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { save } from "@tauri-apps/api/dialog"
import { writeTextFile, BaseDirectory, readTextFile } from "@tauri-apps/api/fs"
import { open } from "@tauri-apps/api/dialog"

const notification = useNotification()

const exportTokens = async () => {
  try {
    const filename = "ythua_export_token.json"

    const saveFilePath = await save({
      defaultPath: BaseDirectory.Download + "/" + filename,
    })

    if (saveFilePath === null) {
      return
    }

    const backup = {
      version: "1.0",
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

const importTokens = async () => {
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
    getTokens().push(...parsed.tokens)
    await useShowNotification(notification, {
      text: "Tokens successfully imported",
      delay: 1500,
    })
  } catch (err) {
    await useShowNotification(notification, {
      text: "Error while importing tokens",
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}

const settings = [
  {
    href: importTokens,
    title: "Import Your Tokens",
    description: "Import your Yhtua token settings ",
  },
  {
    href: exportTokens,
    title: "Export Your Tokens",
    description: "Export your Yhtua token settings",
  },
]
</script>
