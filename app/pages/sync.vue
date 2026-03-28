<template>
  <div class="bg-vault-base h-screen flex flex-col overflow-hidden">
    <DangerModal
      :type="modal.Danger.type"
      :title="modal.Danger.title"
      :text="modal.Danger.text"
      :validateTextButton="modal.Danger.validateTextButton"
      :cancelTextButton="modal.Danger.cancelTextButton"
      :open="modal.Danger.open"
      @close-modal="closeModal"
    />

    <!-- Password Mismatch Modal -->
    <div
      v-if="showPasswordMismatchModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        class="bg-vault-surface border border-vault-border rounded-2xl p-5 mx-4 max-w-sm w-full shadow-2xl shadow-black/30"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-xl bg-vault-warning-subtle border border-vault-warning/20 flex items-center justify-center"
          >
            <svg
              class="w-5 h-5 text-vault-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-vault-text font-semibold text-sm">Password Mismatch</h3>
            <p class="text-vault-text-secondary text-xs">
              Sync password was changed on another device
            </p>
          </div>
        </div>

        <p class="text-vault-text-secondary text-xs mb-3 leading-relaxed">
          Your backup was re-encrypted with a different password (likely changed on another device).
          Enter the new password to continue syncing, or keep your local tokens and disable sync.
        </p>

        <div class="space-y-2 mb-4">
          <input
            v-model="recoveryPassword"
            type="password"
            placeholder="Enter new sync password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-indigo/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="tryRecoverWithPassword"
          />
          <p v-if="recoveryError" class="text-vault-danger text-xs">{{ recoveryError }}</p>
        </div>

        <div class="flex gap-2">
          <button
            @click="keepLocalAndDisableSync"
            class="flex-1 rounded-xl bg-vault-elevated border border-vault-border px-3.5 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            Keep Local
          </button>
          <button
            @click="tryRecoverWithPassword"
            :disabled="!recoveryPassword || recovering"
            class="flex-1 rounded-xl bg-vault-indigo px-3.5 py-2.5 text-sm font-semibold text-vault-base hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {{ recovering ? 'Syncing...' : 'Sync' }}
          </button>
        </div>

        <p class="text-vault-text-muted text-xs mt-3 text-center">
          "Keep Local" disables sync and preserves your current tokens.
        </p>
      </div>
    </div>

    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-3">
      <div class="text-center mb-4">
        <div
          class="w-14 h-14 rounded-2xl bg-vault-indigo-subtle border border-vault-indigo/10 flex items-center justify-center mx-auto mb-3"
        >
          <svg
            class="h-7 w-7 text-vault-indigo"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>
        </div>
        <h2 class="text-lg font-bold tracking-tight text-vault-text">Sync & Backup</h2>
        <p class="mt-0.5 text-xs text-vault-text-secondary">
          Sync encrypted tokens to a cloud folder
        </p>
      </div>

      <div class="flex-col w-full space-y-2">
        <!-- Sync Folder -->
        <div class="bg-vault-elevated rounded-xl p-3.5 border border-vault-border">
          <h3 class="text-vault-text font-semibold text-sm mb-1">Sync Folder</h3>
          <div
            v-if="syncStatus.syncPath"
            class="text-vault-text-secondary text-xs mb-2.5 truncate font-mono"
          >
            {{ syncStatus.syncPath }}
          </div>
          <div v-else class="text-vault-text-muted text-xs mb-2.5">No folder selected</div>
          <button
            @click="selectSyncFolder"
            class="w-full rounded-xl bg-vault-accent px-3.5 py-2 text-sm font-semibold text-vault-base hover:bg-vault-accent-hover transition-colors"
          >
            {{ syncStatus.syncPath ? 'Change Folder' : 'Choose Folder' }}
          </button>
        </div>

        <!-- Sync Password -->
        <div class="bg-vault-elevated rounded-xl p-3.5 border border-vault-border">
          <h3 class="text-vault-text font-semibold text-sm mb-1">Sync Password</h3>
          <p class="text-vault-text-muted text-xs mb-2.5">Encrypts your backup for other devices</p>
          <div v-if="!showPasswordInput && syncStatus.hasPassword" class="flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 rounded-lg bg-vault-success/10 px-2.5 py-1 text-xs font-medium text-vault-success ring-1 ring-inset ring-vault-success/20"
            >
              <svg
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Configured
            </span>
            <button
              @click="showPasswordInput = true"
              class="rounded-lg bg-vault-elevated px-2.5 py-1 text-xs font-medium text-vault-text-secondary ring-1 ring-inset ring-vault-border hover:bg-vault-hover hover:text-vault-text transition-colors"
            >
              Change
            </button>
          </div>
          <div
            v-if="showPasswordInput && syncStatus.hasPassword"
            class="bg-vault-warning-subtle border border-vault-warning/20 rounded-lg p-2.5 mb-2.5"
          >
            <p class="text-vault-warning text-xs">
              Changing password will require other devices to enter the new password to sync.
            </p>
          </div>
          <div v-if="showPasswordInput || !syncStatus.hasPassword" class="space-y-2">
            <input
              v-model="password"
              type="password"
              placeholder="Enter sync password"
              class="w-full rounded-xl border-0 bg-vault-input px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-indigo/40 placeholder:text-vault-text-muted transition-all"
            />
            <input
              v-model="passwordConfirm"
              type="password"
              placeholder="Confirm password"
              class="w-full rounded-xl border-0 bg-vault-input px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-indigo/40 placeholder:text-vault-text-muted transition-all"
            />
            <p v-if="password && password.length < 8" class="text-vault-warning text-xs">
              Password must be at least 8 characters
            </p>
            <p
              v-else-if="password && passwordConfirm && password !== passwordConfirm"
              class="text-vault-danger text-xs"
            >
              Passwords do not match
            </p>
            <div class="flex gap-2">
              <button
                v-if="syncStatus.hasPassword"
                @click="cancelPasswordChange"
                class="flex-1 rounded-xl bg-vault-elevated px-3.5 py-2 text-sm font-medium text-vault-text-secondary ring-1 ring-inset ring-vault-border hover:bg-vault-hover transition-colors"
              >
                Cancel
              </button>
              <button
                @click="savePassword"
                :disabled="!password || password.length < 8 || password !== passwordConfirm"
                :class="syncStatus.hasPassword ? 'flex-1' : 'w-full'"
                class="rounded-xl bg-vault-accent px-3.5 py-2 text-sm font-semibold text-vault-base hover:bg-vault-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save Password
              </button>
            </div>
          </div>
        </div>

        <!-- Auto Sync Toggle -->
        <div class="bg-vault-elevated rounded-xl p-3.5 border border-vault-border">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-vault-text font-semibold text-sm">Auto Sync</h3>
              <p class="text-vault-text-muted text-xs">Sync when tokens change</p>
            </div>
            <button
              @click="toggleAutoSync"
              :class="[
                syncStatus.autoSync ? 'bg-vault-indigo' : 'bg-vault-hover',
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
              ]"
              role="switch"
              :aria-checked="syncStatus.autoSync"
            >
              <span
                :class="[
                  syncStatus.autoSync ? 'translate-x-4' : 'translate-x-0',
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                ]"
              />
            </button>
          </div>
        </div>

        <!-- Status -->
        <div class="bg-vault-elevated rounded-xl p-3.5 border border-vault-border">
          <h3 class="text-vault-text font-semibold text-sm mb-2">Status</h3>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between">
              <span class="text-vault-text-secondary">Sync enabled</span>
              <span
                :class="syncStatus.enabled ? 'text-vault-success' : 'text-vault-text-muted'"
                class="font-medium"
              >
                {{ syncStatus.enabled ? 'Yes' : 'No' }}
              </span>
            </div>
            <div v-if="syncStatus.enabled" class="flex justify-between">
              <span class="text-vault-text-secondary">Background sync</span>
              <span
                :class="
                  syncStatus.passwordMismatch
                    ? 'text-vault-warning'
                    : syncStatus.autoSync
                      ? 'text-vault-success'
                      : 'text-vault-text-muted'
                "
                class="font-medium"
              >
                {{
                  syncStatus.passwordMismatch ? 'Paused' : syncStatus.autoSync ? 'Active' : 'Off'
                }}
              </span>
            </div>
            <div
              v-if="syncStatus.passwordMismatch"
              class="flex justify-between items-center pt-2 border-t border-vault-border mt-2"
            >
              <span class="text-vault-warning font-medium">Password mismatch</span>
              <button
                @click="showPasswordMismatchModal = true"
                class="text-xs px-2.5 py-1 bg-vault-warning rounded-lg text-vault-base font-semibold hover:opacity-90 transition-opacity"
              >
                Fix
              </button>
            </div>
            <div v-if="syncStatus.lastSync" class="flex justify-between">
              <span class="text-vault-text-secondary">Last synced</span>
              <span class="text-vault-text font-mono">{{ formatDate(syncStatus.lastSync) }}</span>
            </div>
            <div v-if="backupInfo?.exists" class="flex justify-between">
              <span class="text-vault-text-secondary">Backup tokens</span>
              <span class="text-vault-text font-mono">{{
                backupInfo.tokensCount ?? 'Unknown'
              }}</span>
            </div>
            <div
              v-if="remoteUpdate.hasUpdates"
              class="flex justify-between items-center pt-2 border-t border-vault-border mt-2"
            >
              <span class="text-vault-warning font-medium">Remote update available</span>
              <button
                @click="showRestoreConfirm"
                class="text-xs px-2.5 py-1 bg-vault-warning rounded-lg text-vault-base font-semibold hover:opacity-90 transition-opacity"
              >
                Load
              </button>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2" v-if="syncStatus.enabled">
          <button
            @click="syncNow"
            :disabled="syncing"
            class="flex-1 rounded-xl bg-vault-success/90 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-vault-success disabled:opacity-40 transition-colors"
          >
            {{ syncing ? 'Syncing...' : 'Sync Now' }}
          </button>
          <button
            v-if="backupInfo?.exists"
            @click="showRestoreConfirm"
            class="flex-1 rounded-xl bg-vault-warning/90 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-vault-warning transition-colors"
          >
            Restore
          </button>
        </div>

        <!-- Disable Sync -->
        <div v-if="syncStatus.enabled" class="pt-3 border-t border-vault-border">
          <button
            @click="showDisableConfirm"
            class="w-full rounded-xl bg-vault-danger-subtle px-3.5 py-2.5 text-sm font-medium text-vault-danger ring-1 ring-inset ring-vault-danger/15 hover:bg-vault-danger/15 transition-colors"
          >
            Disable Sync
          </button>
        </div>
      </div>

      <Notification :text="notification.text" :type="notification.type" v-if="notification.show" />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  checkForRemoteUpdates,
  configureSyncPassword,
  configureSyncPath,
  disableSync,
  getBackupInfo,
  getSyncStatus,
  onPasswordMismatch,
  restoreFromFile,
  type SyncStatus,
  setAutoSync,
  startFileWatcher,
  stopFileWatcher,
  syncToFile,
  tryRestoreWithPassword,
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

const cancelPasswordChange = () => {
  showPasswordInput.value = false
  password.value = ''
  passwordConfirm.value = ''
}
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

const refreshStatus = async (forceRefresh = false) => {
  const status = await getSyncStatus(forceRefresh)
  syncStatus.value = status
  showPasswordInput.value = !status.hasPassword

  if (status.passwordMismatch && !showPasswordMismatchModal.value) {
    showPasswordMismatchModal.value = true
    recoveryPassword.value = ''
    recoveryError.value = ''
  }

  if (status.enabled) {
    const [backup, updates] = await Promise.all([getBackupInfo(status), checkForRemoteUpdates()])
    backupInfo.value = backup
    remoteUpdate.value = updates
  } else {
    backupInfo.value = null
    remoteUpdate.value = { hasUpdates: false, remoteVersion: null }
  }
}

const selectSyncFolder = async () => {
  const path = await configureSyncPath()
  if (path) {
    await refreshStatus(true)

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
    configureSyncPassword(password.value)
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
    title: 'Restore from Backup',
    text: `This will replace your ${getTokens().length} local tokens with ${backupInfo.value?.tokensCount ?? 'unknown'} tokens from backup. Continue?`,
    validateTextButton: 'Restore',
    cancelTextButton: 'Cancel',
    type: 'Danger',
  })
}

const showDisableConfirm = () => {
  modalAction.value = 'disable'
  useShowModal(modal.value.Danger, {
    title: 'Disable Sync',
    text: 'This will remove your sync configuration. Your backup file will not be deleted. Continue?',
    validateTextButton: 'Disable',
    cancelTextButton: 'Cancel',
    type: 'Danger',
  })
}

const closeModal = async (_type: string, response: boolean) => {
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
    disableSync()
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
  onPasswordMismatch(handlePasswordMismatch)
  await refreshStatus()
})
onUnmounted(() => onPasswordMismatch(null))
</script>
