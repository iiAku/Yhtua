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
const notification = useNotification()

const settings = [
  {
    href: () => importTokens(notification),
    title: "Import Your Tokens",
    description: "Import your Yhtua token settings ",
  },
  {
    href: () => exportTokens(notification),
    title: "Export Your Tokens",
    description: "Export your Yhtua token settings",
  },
]
</script>
