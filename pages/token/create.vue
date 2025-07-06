<template>
  <div class="bg-gray-900 h-screen overflow-auto">
    <Navbar />
    <div class="relative isolate overflow-hidden px-6 py-24">
      <h2
        class="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-white"
      >
        Add a new 2FA Token
      </h2>
      <p
        class="mx-auto mt-2 max-w-xl text-center text-lg leading-8 text-gray-300"
      >
        You can add a new 2-Factor Authentication Token accounts using Yhtua.
        You can add accounts by entering the code provided by the service in
        which you want to enable 2FA.
      </p>

      <div class="flex-col w-full my-6 px-8">
        <input
          v-model="token.label"
          class="my-2 min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6 w-full"
          placeholder="Enter your new Token Name"
        />
        <input
          v-model="token.secret"
          @input="token.secret = token.secret.toUpperCase()"
          class="my-2 min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6 w-full"
          placeholder="Enter your token security code"
        />
        <TokenLength class="my-2" @digitSelected="setDigit" />
        <button
          type="submit"
          class="my-2 rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white w-full"
          @click="addToken(token)"
        >
          Add Token
        </button>
        <div class="relative">
          <div class="absolute inset-0 flex items-center" aria-hidden="true">
            <div class="w-full border-t border-gray-300" />
          </div>
          <div class="relative flex justify-center">
            <span class="bg-gray-900 px-2 text-sm text-white">OR</span>
          </div>
        </div>
        <button
          type="submit"
          class="my-2 rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white w-full"
          @click="createImportToken"
        >
          Import Tokens from export
        </button>
      </div>
    </div>
    <Notification
      :text="notification.text"
      :type="notification.type"
      v-if="notification.show"
    />
  </div>
</template>

<script setup lang="ts">
const token = reactive({
  label: "",
  secret: "",
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
      text: validParams.error.issues
        .map((issue) => issue.message)
        .join(", "),
      type: NotificationType.Danger,
    })
  }

  const token: Token = createNewToken(
    validParams.data.secret.toUpperCase(),
    validParams.data.label,
    validParams.data.digits
  )

  storeAddToken(token)

  navigateTo(`/tokens/${token.id}`)
}
</script>
