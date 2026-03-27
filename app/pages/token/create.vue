<template>
  <div class="bg-vault-base h-screen flex flex-col overflow-hidden">
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
