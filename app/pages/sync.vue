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

    <div v-if="showPasswordMismatchModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div class="bg-gray-800 rounded-lg p-4 mx-4 max-w-sm w-full">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-full bg-yellow-600/20 flex items-center justify-center">
            <svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 class="text-white font-semibold text-sm">Password Changed</h3>
        </div>

        <p class="text-gray-400 text-xs mb-3">
          The backup file was encrypted with a different password (possibly changed on another device).
          Enter the new password to sync, or keep your local tokens.
        </p>

        <div class="space-y-2 mb-3">
          <input
            v-model="recoveryPassword"
            type="password"
            placeholder="Enter new sync password"
            class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            @keyup.enter="tryRecoverWithPassword"
          />
          <p v-if="recoveryError" class="text-red-400 text-xs">{{ recoveryError }}</p>
        </div>

        <div class="flex gap-2">
          <button
            @click="tryRecoverWithPassword"
            :disabled="!recoveryPassword || recovering"
            class="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ recovering ? 'Syncing...' : 'Sync' }}
          </button>
          <button
            @click="keepLocalAndDisableSync"
            class="flex-1 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 shadow-sm hover:bg-gray-600"
          >
            Keep Local
          </button>
        </div>

        <p class="text-gray-500 text-xs mt-2 text-center">
          "Keep Local" will disable sync and preserve your current tokens.
        </p>
      </div>
    </div>

    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center mx-auto mb-3">
          <CloudArrowUpIcon class="h-7 w-7 text-indigo-400" />
        </div>
        <h2 class="text-xl font-bold tracking-tight text-white">
          Sync & Backup
        </h2>
        <p class="mt-1 text-xs leading-5 text-gray-400">
          Sync encrypted tokens to a cloud folder
        </p>
      </div>

      <div class="flex-col w-full space-y-3">
        <div class="bg-gray-800 rounded-lg p-3">
          <h3 class="text-white font-medium text-sm mb-1">Sync Folder</h3>
          <div v-if="syncStatus.syncPath" class="text-gray-400 text-xs mb-2 truncate">
            {{ syncStatus.syncPath }}
          </div>
          <div v-else class="text-gray-500 text-xs mb-2">
            No folder selected
          </div>
          <button
            @click="selectSyncFolder"
            class="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            {{ syncStatus.syncPath ? 'Change Folder' : 'Choose Folder' }}
          </button>
        </div>

        <div class="bg-gray-800 rounded-lg p-3">
          <h3 class="text-white font-medium text-sm mb-1">Sync Password</h3>
          <p class="text-gray-500 text-xs mb-2">
            Encrypts your backup for other devices
          </p>
          <div v-if="!showPasswordInput && syncStatus.hasPassword" class="flex items-center gap-2">
            <span class="text-green-400 text-sm">Configured</span>
            <button
              @click="showPasswordInput = true"
              class="text-indigo-400 text-sm hover:text-indigo-300"
            >
              Change
            </button>
          </div>
          <div v-if="showPasswordInput && syncStatus.hasPassword" class="bg-yellow-600/10 border border-yellow-600/30 rounded p-2 mb-2">
            <p class="text-yellow-400 text-xs">
              Changing password will require other devices to enter the new password to sync.
            </p>
          </div>
          <div v-if="showPasswordInput || !syncStatus.hasPassword" class="space-y-2">
            <input
              v-model="password"
              type="password"
              placeholder="Enter sync password"
              class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            />
            <input
              v-model="passwordConfirm"
              type="password"
              placeholder="Confirm password"
              class="w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
            />
            <button
              @click="savePassword"
              :disabled="!password || password !== passwordConfirm"
              class="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Password
            </button>
          </div>
        </div>

        <div class="bg-gray-800 rounded-lg p-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-white font-medium text-sm">Auto Sync</h3>
              <p class="text-gray-500 text-xs">Sync when tokens change</p>
            </div>
            <button
              @click="toggleAutoSync"
              :class="[
                syncStatus.autoSync ? 'bg-indigo-600' : 'bg-gray-600',
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out'
              ]"
            >
              <span
                :class="[
                  syncStatus.autoSync ? 'translate-x-4' : 'translate-x-0',
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                ]"
              />
            </button>
          </div>
        </div>

        <div class="bg-gray-800 rounded-lg p-3">
          <h3 class="text-white font-medium text-sm mb-1">Status</h3>
          <div class="space-y-0.5 text-xs">
            <div class="flex justify-between">
              <span class="text-gray-400">Sync enabled:</span>
              <span :class="syncStatus.enabled ? 'text-green-400' : 'text-gray-500'">
                {{ syncStatus.enabled ? 'Yes' : 'No' }}
              </span>
            </div>
            <div v-if="syncStatus.enabled" class="flex justify-between">
              <span class="text-gray-400">Background sync:</span>
              <span :class="syncStatus.passwordMismatch ? 'text-yellow-400' : (syncStatus.autoSync ? 'text-green-400' : 'text-gray-500')">
                {{ syncStatus.passwordMismatch ? 'Paused' : (syncStatus.autoSync ? 'Active' : 'Off') }}
              </span>
            </div>
            <div v-if="syncStatus.passwordMismatch" class="flex justify-between items-center pt-1.5 border-t border-gray-700 mt-1.5">
              <span class="text-yellow-400 text-sm">Password mismatch</span>
              <button
                @click="showPasswordMismatchModal = true"
                class="text-xs px-2 py-0.5 bg-yellow-600 rounded text-white hover:bg-yellow-500"
              >
                Fix
              </button>
            </div>
            <div v-if="syncStatus.lastSync" class="flex justify-between">
              <span class="text-gray-400">Last synced:</span>
              <span class="text-gray-300">{{ formatDate(syncStatus.lastSync) }}</span>
            </div>
            <div v-if="backupInfo?.exists" class="flex justify-between">
              <span class="text-gray-400">Backup tokens:</span>
              <span class="text-gray-300">{{ backupInfo.tokensCount ?? 'Unknown' }}</span>
            </div>
            <div v-if="remoteUpdate.hasUpdates" class="flex justify-between items-center pt-1.5 border-t border-gray-700 mt-1.5">
              <span class="text-yellow-400 text-sm">Remote update available</span>
              <button
                @click="showRestoreConfirm"
                class="text-xs px-2 py-0.5 bg-yellow-600 rounded text-white hover:bg-yellow-500"
              >
                Load
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-2" v-if="syncStatus.enabled">
          <button
            @click="syncNow"
            :disabled="syncing"
            class="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
          >
            {{ syncing ? 'Syncing...' : 'Sync Now' }}
          </button>
          <button
            v-if="backupInfo?.exists"
            @click="showRestoreConfirm"
            class="flex-1 rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500"
          >
            Restore
          </button>
        </div>

        <div v-if="syncStatus.enabled" class="pt-3 border-t border-gray-700">
          <button
            @click="showDisableConfirm"
            class="w-full rounded-md bg-red-600/20 px-3 py-1.5 text-sm font-semibold text-red-400 ring-1 ring-inset ring-red-600/30 hover:bg-red-600/30"
          >
            Disable Sync
          </button>
        </div>
      </div>

      <Notification
        :text="notification.text"
        :type="notification.type"
        v-if="notification.show"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloudArrowUpIcon } from '@heroicons/vue/24/outline'
import {
  getSyncStatus,
  configureSyncPath,
  configureSyncPassword,
  setAutoSync,
  syncToFile,
  restoreFromFile,
  disableSync,
  getBackupInfo,
  checkForRemoteUpdates,
  startFileWatcher,
  stopFileWatcher,
  onPasswordMismatch,
  tryRestoreWithPassword,
  type SyncStatus,
} from '~/composables/useSync'

const notification = useNotification()
const modal = useModal()

const syncStatus = ref<SyncStatus>({
  enabled: false,
  syncPath: null,
  hasPassword: false,
  lastSync: null,
  lastKnownFileVersion: null,
  autoSync: true,
  passwordMismatch: false,
})

const backupInfo = ref<{
  exists: boolean
  syncedAt: number | null
  tokensCount: number | null
} | null>(null)

const password = ref('')
const passwordConfirm = ref('')
const showPasswordInput = ref(false)
const syncing = ref(false)
const modalAction = ref<'restore' | 'disable' | null>(null)
const remoteUpdate = ref<{ hasUpdates: boolean; remoteVersion: number | null }>({
  hasUpdates: false,
  remoteVersion: null,
})

const showPasswordMismatchModal = ref(false)
const recoveryPassword = ref('')
const recoveryError = ref('')
const recovering = ref(false)

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString()
}

const refreshStatus = async () => {
  syncStatus.value = await getSyncStatus()
  backupInfo.value = await getBackupInfo()
  showPasswordInput.value = !syncStatus.value.hasPassword

  if (syncStatus.value.enabled) {
    remoteUpdate.value = await checkForRemoteUpdates()
  } else {
    remoteUpdate.value = { hasUpdates: false, remoteVersion: null }
  }

  if (syncStatus.value.passwordMismatch && !showPasswordMismatchModal.value) {
    showPasswordMismatchModal.value = true
    recoveryPassword.value = ''
    recoveryError.value = ''
  }
}

const selectSyncFolder = async () => {
  const path = await configureSyncPath()
  if (path) {
    await refreshStatus()

    if (syncStatus.value.enabled) {
      syncing.value = true
      try {
        const result = await syncToFile()
        if (result.success) {
          await refreshStatus()
          await useShowNotification(notification, {
            text: `Backup created with ${result.tokensCount} tokens`,
            delay: 1500,
          })
        } else {
          await useShowNotification(notification, {
            text: result.message,
            delay: 2000,
            type: NotificationType.Danger,
          })
        }
      } finally {
        syncing.value = false
      }

      if (syncStatus.value.autoSync) {
        startFileWatcher()
      }
    } else {
      await useShowNotification(notification, {
        text: 'Sync folder configured',
        delay: 1500,
      })
    }
  }
}

const savePassword = async () => {
  if (password.value && password.value === passwordConfirm.value) {
    await configureSyncPassword(password.value)
    password.value = ''
    passwordConfirm.value = ''
    showPasswordInput.value = false
    await refreshStatus()

    if (syncStatus.value.enabled) {
      syncing.value = true
      try {
        const result = await syncToFile()
        if (result.success) {
          await refreshStatus()
          await useShowNotification(notification, {
            text: `Backup created with ${result.tokensCount} tokens`,
            delay: 1500,
          })
        } else {
          await useShowNotification(notification, {
            text: result.message,
            delay: 2000,
            type: NotificationType.Danger,
          })
        }
      } finally {
        syncing.value = false
      }

      if (syncStatus.value.autoSync) {
        startFileWatcher()
      }
    } else {
      await useShowNotification(notification, {
        text: 'Sync password saved',
        delay: 1500,
      })
    }
  }
}

const toggleAutoSync = async () => {
  const newValue = !syncStatus.value.autoSync
  setAutoSync(newValue)
  syncStatus.value.autoSync = newValue

  if (newValue && syncStatus.value.enabled) {
    startFileWatcher()
  } else {
    stopFileWatcher()
  }
}

const syncNow = async () => {
  syncing.value = true
  try {
    const result = await syncToFile()
    if (result.success) {
      await refreshStatus()
      await useShowNotification(notification, {
        text: `Synced ${result.tokensCount} tokens`,
        delay: 1500,
      })
    } else {
      await useShowNotification(notification, {
        text: result.message,
        delay: 2000,
        type: NotificationType.Danger,
      })
    }
  } finally {
    syncing.value = false
  }
}

const showRestoreConfirm = () => {
  modalAction.value = 'restore'
  useShowModal(modal.value.Danger, {
    title: "Restore from Backup",
    text: `This will replace your ${getTokens().length} local tokens with ${backupInfo.value?.tokensCount ?? 'unknown'} tokens from backup. Continue?`,
    validateTextButton: "Restore",
    cancelTextButton: "Cancel",
    type: "Danger",
  })
}

const showDisableConfirm = () => {
  modalAction.value = 'disable'
  useShowModal(modal.value.Danger, {
    title: "Disable Sync",
    text: "This will remove your sync configuration. Your backup file will not be deleted. Continue?",
    validateTextButton: "Disable",
    cancelTextButton: "Cancel",
    type: "Danger",
  })
}

const closeModal = async (type: string, response: boolean) => {
  modal.value.Danger.open = false

  if (!response) {
    modalAction.value = null
    return
  }

  if (modalAction.value === 'restore') {
    const result = await restoreFromFile(true)
    if (result.success) {
      await refreshStatus()
      await useShowNotification(notification, {
        text: `Restored ${result.tokensCount} tokens`,
        delay: 1500,
      })
    } else {
      await useShowNotification(notification, {
        text: result.message,
        delay: 2000,
        type: NotificationType.Danger,
      })
    }
  } else if (modalAction.value === 'disable') {
    stopFileWatcher()
    await disableSync()
    await refreshStatus()
    await useShowNotification(notification, {
      text: 'Sync disabled',
      delay: 1500,
    })
  }

  modalAction.value = null
}

const handlePasswordMismatch = (_remoteVersion: number) => {
  showPasswordMismatchModal.value = true
  recoveryPassword.value = ''
  recoveryError.value = ''
}

const tryRecoverWithPassword = async () => {
  if (!recoveryPassword.value) return

  recovering.value = true
  recoveryError.value = ''

  try {
    const result = await tryRestoreWithPassword(recoveryPassword.value)
    if (result.success) {
      showPasswordMismatchModal.value = false
      recoveryPassword.value = ''
      await refreshStatus()

      if (syncStatus.value.enabled && syncStatus.value.autoSync) {
        startFileWatcher()
      }

      await useShowNotification(notification, {
        text: `Synced ${result.tokensCount} tokens with new password`,
        delay: 2000,
      })
    } else {
      recoveryError.value = result.message
    }
  } finally {
    recovering.value = false
  }
}

const keepLocalAndDisableSync = async () => {
  showPasswordMismatchModal.value = false
  stopFileWatcher()
  await disableSync()
  await refreshStatus()
  await useShowNotification(notification, {
    text: 'Sync disabled. Your local tokens are preserved.',
    delay: 2500,
  })
}

onMounted(async () => {
  await refreshStatus()

  onPasswordMismatch(handlePasswordMismatch)
})

onUnmounted(() => {
  onPasswordMismatch(null)
})
</script>
