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
        You can add a new 2-Factor Authentication Token accounts such as Gmail,
        Facebook, Dropbox and many more using Yhtua . For the time being it is
        not possible to scan QR codes, but you can add accounts by entering the
        code provided by the service in which you want to enable 2FA.
      </p>

      <div class="flex-col w-full my-6 px-8">
        <input
          v-model="token.label"
          class="my-2 min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6 w-full"
          placeholder="Enter your new Token Name"
        />
        <input
          v-model="token.secret"
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const token = reactive({
  label: "",
  secret: "",
  digits: DEFAULT_DIGITS,
})

const setDigit = (newDigit: number) => (token.digits = newDigit)

const addToken = ({
  secret,
  label,
  digits,
}: {
  secret: string
  label: string
  digits: number
}) => {
  const token: Token = createNewToken(secret, label, digits)
  store.setState({
    tokens: [...store.getState().tokens, token],
  })
  navigateTo(`/tokens/${token.id}`)
}
</script>
