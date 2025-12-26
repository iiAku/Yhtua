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
          <span class="text-xl font-medium text-white">{{ getAvatarPlaceholder(token?.otp.label ?? '') }}</span>
        </div>
        <h2 class="text-xl font-bold tracking-tight text-white">
          Edit Token
        </h2>
        <p class="mt-1 text-xs leading-5 text-gray-400">
          {{ token?.otp.label }}
        </p>
      </div>

      <div class="space-y-3">
        <input
          v-if="token"
          v-model="token.otp.label"
          class="w-full rounded-lg border-0 bg-gray-800 px-3 py-2 text-white text-sm placeholder:text-gray-500 ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          placeholder="Token name"
        />

        <div class="relative">
          <input
            v-model="secretValue"
            :type="showSecret ? 'text' : 'password'"
            class="w-full rounded-lg border-0 bg-gray-800 px-3 py-2 pr-10 text-white text-sm font-mono placeholder:text-gray-500 ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            placeholder="Secret key"
            @input="secretValue = secretValue.toUpperCase()"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white"
            @click="showSecret = !showSecret"
          >
            <EyeSlashIcon v-if="showSecret" class="h-5 w-5" />
            <EyeIcon v-else class="h-5 w-5" />
          </button>
        </div>

        <TokenLength @digitSelected="setDigit" />

        <button
          v-if="token"
          type="button"
          class="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          @click="saveToken(token)"
        >
          Save Changes
        </button>

        <div class="pt-3 border-t border-gray-700">
          <button
            type="button"
            class="w-full rounded-lg bg-red-600/20 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-inset ring-red-600/30 hover:bg-red-600/30"
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
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
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
