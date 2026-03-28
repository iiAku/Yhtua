<template>
  <div class="bg-vault-base h-screen flex flex-col overflow-hidden">
    <!-- Import Password Modal -->
    <div
      v-if="showImportPassword"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
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
            <h3 class="text-vault-text font-semibold text-sm">Encrypted Backup</h3>
            <p class="text-vault-text-secondary text-xs">Enter password to decrypt</p>
          </div>
        </div>

        <div class="space-y-2 mb-4">
          <input
            ref="importPasswordInput"
            v-model="importPassword"
            type="password"
            placeholder="Backup password"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 placeholder:text-vault-text-muted transition-all"
            @keyup.enter="submitImportPassword"
          />
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
      </div>
    </div>

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
          class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm font-medium placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
          placeholder="Token name (e.g. GitHub)"
        />
        <input
          v-model="token.secret"
          @input="token.secret = token.secret.toUpperCase()"
          class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm font-mono placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
          placeholder="Secret key (e.g. JBSWY3DPEHPK3PXP)"
        />
        <TokenLength @digitSelected="setDigit" />
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
import {
  completePendingEncryptedImport,
  clearPendingEncryptedImport,
  hasPendingEncryptedImport,
} from '~/composables/useSettings'

const token = reactive({
  label: '',
  secret: '',
  digits: DEFAULT_DIGITS,
})

const notification = useNotification()

const showImportPassword = ref(false)
const importPassword = ref('')
const importing = ref(false)
const importPasswordInput = ref<HTMLInputElement>()

const createImportToken = async () => {
  await importTokens(notification, true)
  if (hasPendingEncryptedImport()) {
    showImportPassword.value = true
    importPassword.value = ''
    await nextTick()
    importPasswordInput.value?.focus()
  }
}

const submitImportPassword = async () => {
  if (!importPassword.value || importing.value) return
  importing.value = true
  const result = await completePendingEncryptedImport(importPassword.value)
  importing.value = false

  if (result.success) {
    showImportPassword.value = false
    importPassword.value = ''
    await useShowNotification(notification, {
      text: `${result.tokensCount} tokens imported`,
      delay: 1500,
    })
    navigateTo('/')
  } else {
    await useShowNotification(notification, {
      text: result.error ?? 'Import failed',
      type: NotificationType.Danger,
    })
  }
}

const cancelImportPassword = () => {
  showImportPassword.value = false
  importPassword.value = ''
  clearPendingEncryptedImport()
}

const setDigit = (newDigit: number) => (token.digits = newDigit)

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
      text: validParams.error.errors[0].message,
      type: NotificationType.Danger,
    })
  }

  const duplicate = isDuplicateLabel(validParams.data.label)
  if (duplicate) {
    return useShowNotification(notification, {
      text: `A token named "${duplicate.otp.label}" already exists`,
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
