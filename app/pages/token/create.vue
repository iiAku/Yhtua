<template>
  <div class="bg-gray-900 h-screen flex flex-col overflow-hidden">
    <Navbar />
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div class="text-center mb-6">
        <div
          class="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center mx-auto mb-3"
        >
          <PlusCircleIcon class="h-7 w-7 text-indigo-400" />
        </div>
        <h2 class="text-xl font-bold tracking-tight text-white">Add Token</h2>
        <p class="mt-1 text-xs leading-5 text-gray-400">Enter the secret key from your service</p>
      </div>

      <div class="space-y-3">
        <input
          v-model="token.label"
          class="w-full rounded-lg border-0 bg-gray-800 px-3 py-2 text-white text-sm placeholder:text-gray-500 ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          placeholder="Token name (e.g. GitHub)"
        />
        <input
          v-model="token.secret"
          @input="token.secret = token.secret.toUpperCase()"
          class="w-full rounded-lg border-0 bg-gray-800 px-3 py-2 text-white text-sm font-mono placeholder:text-gray-500 ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          placeholder="Secret key (e.g. JBSWY3DPEHPK3PXP)"
        />
        <TokenLength @digitSelected="setDigit" />
        <button
          type="submit"
          class="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          @click="addToken(token)"
        >
          Add Token
        </button>

        <div class="relative py-2">
          <div class="absolute inset-0 flex items-center" aria-hidden="true">
            <div class="w-full border-t border-gray-700" />
          </div>
          <div class="relative flex justify-center">
            <span class="bg-gray-900 px-2 text-xs text-gray-500">or</span>
          </div>
        </div>

        <button
          type="button"
          class="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 shadow-sm hover:bg-gray-700 ring-1 ring-inset ring-gray-700"
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
import { PlusCircleIcon } from '@heroicons/vue/24/outline'

const token = reactive({
  label: '',
  secret: '',
  digits: DEFAULT_DIGITS,
})

const notification = useNotification()

const createImportToken = () => importTokens(notification, true)

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

  try {
    const token: Token = await createNewToken(
      validParams.data.secret,
      validParams.data.label,
      validParams.data.digits,
    )

    storeAddToken(token)

    navigateTo(`/tokens/${token.id}`)
  } catch (error) {
    return useShowNotification(notification, {
      text: 'Failed to create token',
      type: NotificationType.Danger,
    })
  }
}
</script>
