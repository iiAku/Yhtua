<template>
  <div class="bg-vault-base h-screen flex flex-col overflow-hidden">
    <!-- Import Password Modal -->
    <Dialog
      v-if="showImportPassword"
      :open="showImportPassword"
      as="div"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @close="cancelImportPassword"
    >
      <DialogPanel
        class="bg-vault-surface border border-vault-border rounded-2xl p-5 mx-4 max-w-sm w-full shadow-2xl shadow-black/30"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-xl bg-vault-accent-subtle border border-vault-accent/10 flex items-center justify-center"
          >
            <svg
              class="w-5 h-5 text-vault-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <div>
            <DialogTitle as="h3" class="text-vault-text font-semibold text-sm">
              Encrypted Backup
            </DialogTitle>
            <p class="text-vault-text-secondary text-xs">Enter password to decrypt</p>
          </div>
        </div>

        <div class="space-y-2 mb-4">
          <input
            ref="importPasswordInput"
            v-model="importPassword"
            type="password"
            aria-label="Backup password"
            placeholder="Backup password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="submitImportPassword"
          />
          <p v-if="importPasswordError" class="text-vault-danger text-xs">
            {{ importPasswordError }}
          </p>
        </div>

        <div class="flex gap-2">
          <button
            @click="cancelImportPassword"
            class="flex-1 rounded-xl bg-vault-elevated border border-vault-border px-3.5 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            Cancel
          </button>
          <button
            @click="submitImportPassword"
            :disabled="!importPassword || importing"
            class="flex-1 rounded-xl bg-vault-accent px-3.5 py-2.5 text-sm font-semibold text-vault-base hover:bg-vault-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {{ importing ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </DialogPanel>
    </Dialog>

    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6 animate-fade-in-up">
        <div
          class="w-14 h-14 rounded-2xl bg-vault-accent-subtle border border-vault-accent/10 flex items-center justify-center mx-auto mb-3"
        >
          <svg
            class="h-7 w-7 text-vault-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <h2 class="text-lg font-bold tracking-tight text-vault-text">Add Token</h2>
        <p class="mt-1 text-xs text-vault-text-secondary">Enter the secret key from your service</p>
      </div>

      <div class="space-y-3">
        <input
          v-model="token.label"
          aria-label="Token name"
          class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm font-medium placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
          placeholder="Token name (e.g. GitHub)"
        />
        <div class="relative">
          <input
            v-model="token.secret"
            :type="showSecret ? 'text' : 'password'"
            aria-label="Base32 secret key"
            autocomplete="off"
            autocapitalize="characters"
            :spellcheck="false"
            @input="token.secret = token.secret.toUpperCase()"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 pr-10 text-vault-text text-sm font-mono placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
            placeholder="Secret key (e.g. JBSWY3DPEHPK3PXP)"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 flex items-center pr-3 text-vault-text-muted hover:text-vault-text-secondary transition-colors"
            :aria-label="showSecret ? 'Hide secret' : 'Show secret'"
            :aria-pressed="showSecret"
            @click="showSecret = !showSecret"
          >
            <svg
              v-if="showSecret"
              class="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
            <svg
              v-else
              class="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </div>
        <TokenLength v-model="token.digits" />
        <button
          type="submit"
          class="w-full rounded-xl bg-vault-accent px-3.5 py-2.5 text-sm font-semibold text-vault-base hover:bg-vault-accent-hover transition-colors"
          @click="addToken(token)"
        >
          Add Token
        </button>

        <div class="relative py-2">
          <div class="absolute inset-0 flex items-center" aria-hidden="true">
            <div class="w-full border-t border-vault-border" />
          </div>
          <div class="relative flex justify-center">
            <span class="bg-vault-base px-3 text-xs text-vault-text-muted font-medium">or</span>
          </div>
        </div>

        <button
          type="button"
          class="w-full rounded-xl bg-vault-elevated px-3.5 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text ring-1 ring-inset ring-vault-border hover:ring-vault-border-active transition-all"
          @click="createImportToken"
        >
          Import from backup
        </button>
      </div>
    </div>
    <Notification :text="notification.text" :type="notification.type" v-if="notification.show" />
  </div>
</template>

<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import {
  type BackupResult,
  completePendingEncryptedImport,
  clearPendingEncryptedImport,
  hasPendingEncryptedImport,
  importTokens,
} from '~/composables/useSettings'

const token = reactive({
  label: '',
  secret: '',
  digits: DEFAULT_DIGITS,
})
const showSecret = ref(false)

const notification = useNotification()

const showImportPassword = ref(false)
const importPassword = ref('')
const importPasswordError = ref('')
const importing = ref(false)
const importPasswordInput = ref<HTMLInputElement>()

const createImportToken = async () => {
  const result = await importTokens()

  if (result.needsPassword && hasPendingEncryptedImport()) {
    showImportPassword.value = true
    importPassword.value = ''
    await nextTick()
    importPasswordInput.value?.focus()
    return
  }

  if (result.cancelled) return

  if (!result.success) {
    await useShowNotification(notification, {
      text: result.error ?? 'Import failed',
      delay: 3000,
      type: NotificationType.Danger,
    })
    return
  }

  await useShowNotification(notification, {
    text: `${result.tokensCount} tokens imported`,
    delay: 1500,
  })
  navigateTo('/')
}

const submitImportPassword = async () => {
  if (!importPassword.value || importing.value) return
  importing.value = true
  importPasswordError.value = ''

  let result: BackupResult
  try {
    result = await completePendingEncryptedImport(importPassword.value)
  } finally {
    importing.value = false
  }

  if (result.cancelled) {
    cancelImportPassword()
    return
  }

  // Inline, not a toast: the modal is still open and would cover it.
  if (!result.success) {
    importPasswordError.value = result.error ?? 'Import failed'
    return
  }

  cancelImportPassword()
  await useShowNotification(notification, {
    text: `${result.tokensCount} tokens imported`,
    delay: 1500,
  })
  navigateTo('/')
}

const cancelImportPassword = () => {
  showImportPassword.value = false
  importPassword.value = ''
  importPasswordError.value = ''
  clearPendingEncryptedImport()
}

onBeforeUnmount(() => {
  token.secret = ''
  importPassword.value = ''
  clearPendingEncryptedImport()
})

const addToken = async ({
  secret,
  label,
  digits,
}: {
  secret: string
  label: string
  digits: number
}) => {
  const validParams = addTokenSchema.safeParse({ secret, label, digits })

  if (validParams.success === false) {
    return useShowNotification(notification, {
      text: validParams.error.issues[0]?.message ?? 'Invalid token',
      type: NotificationType.Danger,
    })
  }

  try {
    await initializeEncryption()
    const token: Token = await createNewToken(
      validParams.data.secret,
      validParams.data.label,
      validParams.data.digits,
    )

    storeAddToken(token)
    localStorage.setItem('yhtua_onboarding_done', '1')

    navigateTo(`/tokens/${token.id}`)
  } catch (error) {
    console.error('Token creation failed:', error)
    return useShowNotification(notification, {
      text: `Failed to create token: ${error instanceof Error ? error.message : String(error)}`,
      type: NotificationType.Danger,
    })
  }
}
</script>
