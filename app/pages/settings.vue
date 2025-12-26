<template>
  <div class="bg-gray-900 h-screen flex flex-col overflow-hidden">
    <DangerModal
      :type="modal.Danger.type"
      :title="modal.Danger.title"
      :text="modal.Danger.text"
      :validateTextButton="modal.Danger.validateTextButton"
      :cancelTextButton="modal.Danger.cancelTextButton"
      :open="modal.Danger.open"
      @close-modal="closeModal"
    />
    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-3">
          <Cog6ToothIcon class="h-7 w-7 text-gray-300" />
        </div>
        <h2 class="text-xl font-bold tracking-tight text-white">
          Settings
        </h2>
        <p class="mt-1 text-xs leading-5 text-gray-400">
          Manage your tokens and backups
        </p>
      </div>

      <div class="space-y-3">
        <button
          @click="navigateTo('/sync')"
          class="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-750 transition-colors flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
            <CloudArrowUpIcon class="h-5 w-5 text-indigo-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white">Sync & Backup</h3>
            <p class="text-xs text-gray-400 mt-0.5">Sync encrypted tokens to cloud folder</p>
          </div>
          <ChevronRightIcon class="h-5 w-5 text-gray-500 flex-shrink-0" />
        </button>

        <button
          @click="importTokens(notification)"
          class="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-750 transition-colors flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
            <ArrowDownTrayIcon class="h-5 w-5 text-green-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white">Import Tokens</h3>
            <p class="text-xs text-gray-400 mt-0.5">Restore from a backup file</p>
          </div>
          <ChevronRightIcon class="h-5 w-5 text-gray-500 flex-shrink-0" />
        </button>

        <button
          @click="exportTokens(notification)"
          class="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-750 transition-colors flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <ArrowUpTrayIcon class="h-5 w-5 text-blue-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white">Export Tokens</h3>
            <p class="text-xs text-gray-400 mt-0.5">Save tokens to a backup file</p>
          </div>
          <ChevronRightIcon class="h-5 w-5 text-gray-500 flex-shrink-0" />
        </button>

        <div class="pt-4 mt-4 border-t border-gray-800">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-3">Danger Zone</p>
          <button
            @click="showRemoveDialogue"
            class="w-full bg-red-600/10 rounded-lg p-4 text-left hover:bg-red-600/20 transition-colors flex items-center gap-4 ring-1 ring-inset ring-red-600/20"
          >
            <div class="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
              <TrashIcon class="h-5 w-5 text-red-400" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-red-400">Delete All Tokens</h3>
              <p class="text-xs text-red-400/70 mt-0.5">This action cannot be undone</p>
            </div>
          </button>
        </div>
      </div>

      <Notification
        :text="notification.text"
        :type="notification.type"
        v-if="notification.show"
      />
    </div>

    <footer class="py-4 text-center border-t border-gray-800">
      <p class="text-xs text-gray-500">Yhtua v{{ appVersion }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'

const appVersion = __APP_VERSION__

const notification = useNotification()
const modal = useModal()

const showRemoveDialogue = () =>
  useShowModal(modal.value.Danger, {
    title: 'Delete All Tokens',
    text: 'Are you sure you want to delete all tokens? This action cannot be undone.',
    validateTextButton: 'Delete All',
    cancelTextButton: 'Cancel',
    type: 'Danger',
  })

const closeModal = async (_type: string, response: boolean) => {
  modal.value.Danger.open = false
  if (response) {
    await removeAllTokens(notification)
  }
}
</script>

<style scoped>
.hover\:bg-gray-750:hover {
  background-color: rgb(42, 48, 60);
}
</style>
