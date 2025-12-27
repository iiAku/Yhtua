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

    <!-- Export Password Modal -->
    <div v-if="showExportPasswordModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div class="bg-gray-800 rounded-lg p-4 mx-4 max-w-sm w-full">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
            <ArrowUpTrayIcon class="w-4 h-4 text-blue-400" />
          </div>
          <h3 class="text-white font-semibold text-sm">Export Tokens</h3>
        </div>

        <p class="text-gray-400 text-xs mb-3">
          Enter a password to encrypt your backup file. You'll need this password to import on any device.
        </p>

        <div class="space-y-2 mb-3">
          <input
            v-model="exportPassword"
            type="password"
            placeholder="Enter password"
            class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            @keyup.enter="confirmExport"
          />
          <input
            v-model="exportPasswordConfirm"
            type="password"
            placeholder="Confirm password"
            class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            @keyup.enter="confirmExport"
          />
          <p v-if="exportPasswordError" class="text-red-400 text-xs">{{ exportPasswordError }}</p>
        </div>

        <div class="flex gap-2">
          <button
            @click="confirmExport"
            :disabled="!exportPassword || exportPassword !== exportPasswordConfirm || exporting"
            class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ exporting ? 'Exporting...' : 'Export' }}
          </button>
          <button
            @click="cancelExport"
            class="flex-1 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 shadow-sm hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Import Password Modal -->
    <div v-if="showImportPasswordModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div class="bg-gray-800 rounded-lg p-4 mx-4 max-w-sm w-full">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-full bg-green-600/20 flex items-center justify-center">
            <ArrowDownTrayIcon class="w-4 h-4 text-green-400" />
          </div>
          <h3 class="text-white font-semibold text-sm">Import Tokens</h3>
        </div>

        <p class="text-gray-400 text-xs mb-3">
          Enter the password used to encrypt this backup file.
        </p>

        <div class="space-y-2 mb-3">
          <input
            v-model="importPassword"
            type="password"
            placeholder="Enter password"
            class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            @keyup.enter="confirmImport"
          />
          <p v-if="importPasswordError" class="text-red-400 text-xs">{{ importPasswordError }}</p>
        </div>

        <div class="flex gap-2">
          <button
            @click="confirmImport"
            :disabled="!importPassword || importing"
            class="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ importing ? 'Importing...' : 'Import' }}
          </button>
          <button
            @click="cancelImport"
            class="flex-1 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 shadow-sm hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

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
          @click="openImportModal"
          class="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-750 transition-colors flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
            <ArrowDownTrayIcon class="h-5 w-5 text-green-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white">Import Tokens</h3>
            <p class="text-xs text-gray-400 mt-0.5">Restore from an encrypted backup</p>
          </div>
          <ChevronRightIcon class="h-5 w-5 text-gray-500 flex-shrink-0" />
        </button>

        <button
          @click="openExportModal"
          class="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-750 transition-colors flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <ArrowUpTrayIcon class="h-5 w-5 text-blue-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white">Export Tokens</h3>
            <p class="text-xs text-gray-400 mt-0.5">Save encrypted backup file</p>
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
import { exportTokensEncrypted, importTokensEncrypted } from '~/composables/useSettings'

const appVersion = __APP_VERSION__

const notification = useNotification()
const modal = useModal()

const showExportPasswordModal = ref(false)
const exportPassword = ref('')
const exportPasswordConfirm = ref('')
const exportPasswordError = ref('')
const exporting = ref(false)

const showImportPasswordModal = ref(false)
const importPassword = ref('')
const importPasswordError = ref('')
const importing = ref(false)

const openExportModal = () => {
  exportPassword.value = ''
  exportPasswordConfirm.value = ''
  exportPasswordError.value = ''
  showExportPasswordModal.value = true
}

const cancelExport = () => {
  showExportPasswordModal.value = false
  exportPassword.value = ''
  exportPasswordConfirm.value = ''
  exportPasswordError.value = ''
}

const confirmExport = async () => {
  if (!exportPassword.value || exportPassword.value !== exportPasswordConfirm.value) {
    exportPasswordError.value = 'Passwords do not match'
    return
  }

  exporting.value = true
  exportPasswordError.value = ''

  try {
    const success = await exportTokensEncrypted(notification, exportPassword.value)
    if (success) {
      showExportPasswordModal.value = false
      exportPassword.value = ''
      exportPasswordConfirm.value = ''
    }
  } finally {
    exporting.value = false
  }
}

const openImportModal = () => {
  importPassword.value = ''
  importPasswordError.value = ''
  showImportPasswordModal.value = true
}

const cancelImport = () => {
  showImportPasswordModal.value = false
  importPassword.value = ''
  importPasswordError.value = ''
}

const confirmImport = async () => {
  if (!importPassword.value) {
    importPasswordError.value = 'Password is required'
    return
  }

  importing.value = true
  importPasswordError.value = ''

  try {
    const success = await importTokensEncrypted(notification, importPassword.value)
    if (success) {
      showImportPasswordModal.value = false
      importPassword.value = ''
    }
  } finally {
    importing.value = false
  }
}

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
