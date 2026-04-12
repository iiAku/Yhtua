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
    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6">
        <div
          class="w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto mb-3"
          :class="avatarBgClass(token?.otp.label ?? '')"
        >
          <span class="text-lg font-bold" :class="avatarTextClass(token?.otp.label ?? '')">{{
            getAvatarPlaceholder(token?.otp.label ?? '')
          }}</span>
        </div>
        <h2 class="text-lg font-bold tracking-tight text-vault-text">Edit Token</h2>
        <p class="mt-1 text-xs text-vault-text-secondary">
          {{ token?.otp.label }}
        </p>
      </div>

      <div class="space-y-3">
        <input
          v-if="token"
          v-model="token.otp.label"
          class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 text-vault-text text-sm font-medium placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
          placeholder="Token name"
        />

        <div class="relative">
          <input
            v-model="secretValue"
            :type="showSecret ? 'text' : 'password'"
            class="w-full rounded-xl border-0 bg-vault-elevated px-3.5 py-2.5 pr-10 text-vault-text text-sm font-mono placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 transition-all"
            placeholder="Secret key"
            @input="secretValue = secretValue.toUpperCase()"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 flex items-center pr-3 text-vault-text-muted hover:text-vault-text-secondary transition-colors"
            aria-label="Toggle secret visibility"
            @click="showSecret = !showSecret"
          >
            <svg
              v-if="showSecret"
              class="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
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

        <TokenLength @digitSelected="setDigit" />

        <button
          v-if="token"
          type="button"
          class="w-full rounded-xl bg-vault-accent px-3.5 py-2.5 text-sm font-semibold text-vault-base hover:bg-vault-accent-hover transition-colors"
          @click="saveToken(token)"
        >
          Save Changes
        </button>

        <div class="pt-3 border-t border-vault-border">
          <button
            type="button"
            class="w-full rounded-xl bg-vault-danger-subtle px-3.5 py-2.5 text-sm font-medium text-vault-danger ring-1 ring-inset ring-vault-danger/20 hover:bg-vault-danger/15 transition-colors"
            @click="showRemoveDialogue()"
          >
            Delete Token
          </button>
        </div>
      </div>
    </div>
    <Notification
      :text="notification.text"
      :type="notification.type"
      :withLoader="notification.withLoader"
      v-if="notification.show"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { decryptSecret, encryptSecret } from '~/composables/useCrypto'

const route = useRoute()

const token = ref<Token | undefined>(getTokens().find((token) => token.id === route.params.id))

if (!token.value) {
  navigateTo('/')
}

const secretValue = ref('')
const originalSecret = ref('')
const showSecret = ref(false)

onMounted(async () => {
  if (token.value) {
    try {
      const decrypted = token.value.otp.encrypted
        ? await decryptSecret(token.value.otp.secret)
        : token.value.otp.secret
      secretValue.value = decrypted
      originalSecret.value = decrypted
    } catch (error) {
      console.error('Failed to decrypt secret:', error)
    }
  }
})

const notification = useNotification()

const modal = useModal()

const showRemoveDialogue = () =>
  useShowModal(modal.value.Danger, {
    title: 'Delete Token',
    text: 'Are you sure you want to delete this token? This action cannot be undone.',
    validateTextButton: 'Delete',
    cancelTextButton: 'Cancel',
    type: 'Danger',
  })

const closeModal = async (_type: string, response: boolean) => {
  modal.value.Danger.open = false
  if (response && token.value) {
    await deleteToken(token.value)
  }
}

const setDigit = (newDigit: number) => {
  if (token.value) {
    token.value.otp.digits = newDigit
  }
}

const saveToken = async (tokenToSave: Token) => {
  const updates: Partial<Token['otp']> = {
    label: tokenToSave.otp.label,
    digits: tokenToSave.otp.digits,
  }

  if (secretValue.value && secretValue.value !== originalSecret.value) {
    updates.secret = await encryptSecret(secretValue.value)
    updates.encrypted = true
  }

  updateTokenOtp(tokenToSave.id, updates)

  await useShowNotification(notification, {
    text: 'Changes saved',
    delay: 1500,
  })
}

const deleteToken = async (token: Token) => {
  addTombstone(token.id)
  store.setState({
    tokens: store.getState().tokens.filter((t: Token) => t.id !== token.id),
  })

  await useShowNotification(notification, {
    text: 'Token deleted',
    delay: 1500,
    withLoader: true,
  })

  navigateTo(`/`)
}
</script>
