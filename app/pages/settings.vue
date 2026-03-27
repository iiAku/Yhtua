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

    <!-- Export Password Modal -->
    <div
      v-if="showExportPasswordModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        class="bg-vault-surface border border-vault-border rounded-2xl p-5 mx-4 max-w-sm w-full shadow-2xl shadow-black/30"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-xl bg-vault-blue-subtle border border-vault-blue/10 flex items-center justify-center"
          >
            <svg
              class="w-5 h-5 text-vault-blue"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-vault-text font-semibold text-sm">Export Tokens</h3>
            <p class="text-vault-text-secondary text-xs">Encrypt your backup file</p>
          </div>
        </div>

        <div class="space-y-2 mb-4">
          <input
            v-model="exportPassword"
            type="password"
            placeholder="Enter password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="confirmExport"
          />
          <input
            v-model="exportPasswordConfirm"
            type="password"
            placeholder="Confirm password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="confirmExport"
          />
          <p v-if="exportPasswordError" class="text-vault-danger text-xs">
            {{ exportPasswordError }}
          </p>
          <p
            v-else-if="exportPassword && exportPassword.length < 8"
            class="text-vault-warning text-xs"
          >
            Password must be at least 8 characters
          </p>
          <p
            v-else-if="
              exportPassword && exportPasswordConfirm && exportPassword !== exportPasswordConfirm
            "
            class="text-vault-danger text-xs"
          >
            Passwords do not match
          </p>
        </div>

        <div class="flex gap-2">
          <button
            @click="cancelExport"
            class="flex-1 rounded-xl bg-vault-elevated border border-vault-border px-3.5 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirmExport"
            :disabled="
              !exportPassword ||
              exportPassword.length < 8 ||
              exportPassword !== exportPasswordConfirm ||
              exporting
            "
            class="flex-1 rounded-xl bg-vault-blue px-3.5 py-2.5 text-sm font-semibold text-vault-base hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {{ exporting ? 'Exporting...' : 'Export' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Import Password Modal -->
    <div
      v-if="showImportPasswordModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        class="bg-vault-surface border border-vault-border rounded-2xl p-5 mx-4 max-w-sm w-full shadow-2xl shadow-black/30"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-xl bg-vault-success-subtle border border-vault-success/10 flex items-center justify-center"
          >
            <svg
              class="w-5 h-5 text-vault-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-vault-text font-semibold text-sm">Import Tokens</h3>
            <p class="text-vault-text-secondary text-xs">Decrypt your backup file</p>
          </div>
        </div>

        <div class="space-y-2 mb-4">
          <input
            v-model="importPassword"
            type="password"
            placeholder="Enter backup password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="confirmImport"
          />
          <p v-if="importPasswordError" class="text-vault-danger text-xs">
            {{ importPasswordError }}
          </p>
        </div>

        <div class="flex gap-2">
          <button
            @click="cancelImport"
            class="flex-1 rounded-xl bg-vault-elevated border border-vault-border px-3.5 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirmImport"
            :disabled="!importPassword || importing"
            class="flex-1 rounded-xl bg-vault-success/90 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-vault-success disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {{ importing ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </div>
    </div>

    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6">
        <div
          class="w-14 h-14 rounded-2xl bg-vault-elevated border border-vault-border flex items-center justify-center mx-auto mb-3"
        >
          <svg
            class="h-7 w-7 text-vault-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </div>
        <h2 class="text-lg font-bold tracking-tight text-vault-text">Settings</h2>
        <p class="mt-1 text-xs text-vault-text-secondary">Manage your tokens and backups</p>
      </div>

      <div class="space-y-2">
        <button
          @click="navigateTo('/sync')"
          class="group w-full bg-vault-elevated rounded-xl p-3.5 text-left hover:bg-vault-hover border border-vault-border hover:border-vault-border-active transition-all flex items-center gap-3.5"
        >
          <div
            class="w-10 h-10 rounded-xl bg-vault-indigo-subtle border border-vault-indigo/10 flex items-center justify-center flex-shrink-0"
          >
            <svg
              class="h-5 w-5 text-vault-indigo"
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
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-vault-text">Sync & Backup</h3>
            <p class="text-xs text-vault-text-secondary mt-0.5">
              Sync encrypted tokens to cloud folder
            </p>
          </div>
          <svg
            class="h-4 w-4 text-vault-text-muted group-hover:text-vault-accent transition-colors flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        <button
          @click="openImportModal"
          class="group w-full bg-vault-elevated rounded-xl p-3.5 text-left hover:bg-vault-hover border border-vault-border hover:border-vault-border-active transition-all flex items-center gap-3.5"
        >
          <div
            class="w-10 h-10 rounded-xl bg-vault-success-subtle border border-vault-success/10 flex items-center justify-center flex-shrink-0"
          >
            <svg
              class="h-5 w-5 text-vault-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-vault-text">Import Tokens</h3>
            <p class="text-xs text-vault-text-secondary mt-0.5">Restore from an encrypted backup</p>
          </div>
          <svg
            class="h-4 w-4 text-vault-text-muted group-hover:text-vault-accent transition-colors flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        <button
          @click="openExportModal"
          class="group w-full bg-vault-elevated rounded-xl p-3.5 text-left hover:bg-vault-hover border border-vault-border hover:border-vault-border-active transition-all flex items-center gap-3.5"
        >
          <div
            class="w-10 h-10 rounded-xl bg-vault-blue-subtle border border-vault-blue/10 flex items-center justify-center flex-shrink-0"
          >
            <svg
              class="h-5 w-5 text-vault-blue"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-vault-text">Export Tokens</h3>
            <p class="text-xs text-vault-text-secondary mt-0.5">Save encrypted backup file</p>
          </div>
          <svg
            class="h-4 w-4 text-vault-text-muted group-hover:text-vault-accent transition-colors flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        <div class="pt-4 mt-2 border-t border-vault-border">
          <p class="text-xs text-vault-text-muted uppercase tracking-wider font-semibold mb-2">
            Danger Zone
          </p>
          <button
            @click="showRemoveDialogue"
            class="w-full bg-vault-danger-subtle rounded-xl p-3.5 text-left hover:bg-vault-danger/15 transition-colors flex items-center gap-3.5 ring-1 ring-inset ring-vault-danger/15"
          >
            <div
              class="w-10 h-10 rounded-xl bg-vault-danger/10 border border-vault-danger/20 flex items-center justify-center flex-shrink-0"
            >
              <svg
                class="h-5 w-5 text-vault-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-vault-danger">Delete All Tokens</h3>
              <p class="text-xs text-vault-danger/60 mt-0.5">This action cannot be undone</p>
            </div>
          </button>
        </div>
      </div>

      <Notification :text="notification.text" :type="notification.type" v-if="notification.show" />
    </div>

    <footer class="py-3 text-center border-t border-vault-border">
      <p class="text-xs text-vault-text-muted font-mono">Yhtua v{{ appVersion }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
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
