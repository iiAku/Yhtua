<template>
  <div>
    <Navbar :tokenId="token?.id" />
    <div class="mt-20 mx-auto my-auto px-6 text-center lg:px-8">
      <span
        class="inline-flex h-48 w-48 items-center justify-center rounded-full bg-gray-500"
      >
        <span class="text-3xl font-medium leading-none text-white">{{
          getAvatarPlaceholder(token?.otp.label ?? "")
        }}</span>
      </span>

      <h3
        class="mt-6 text-base font-semibold leading-7 tracking-tight text-gray-400"
      >
        {{ token?.otp.label }}
      </h3>
      <p class="text-7xl my-10 leading-6 text-gray-400">
        {{ renderedToken.value }}
      </p>
      <button
        type="button"
        class="rounded-full bg-slate-600 p-2 text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
        v-on:click="copy"
      >
        <ClipboardDocumentListIcon class="h-5 w-5" aria-hidden="true" />
      </button>
      <div class="my-3">
        <span
          class="inline-flex justify-center items-center rounded-md bg-gray-400/10 px-2 py-1 text-lg font-medium text-gray-400 ring-1 ring-inset ring-gray-400/30 font-mono"
          >Changes in {{ padNumber(renderedToken.remainingTime) }} Seconds</span
        >
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
import { ClipboardDocumentListIcon } from "@heroicons/vue/20/solid"

const route = useRoute()

const notification = useNotification()

const time = ref(DEFAULT_PERIOD)

const token = ref<Token | undefined>(
  store.getState().tokens.find((token) => token.id === route.params.id)
)

if (!token.value) {
  navigateTo("/")
}

const renderedToken = reactive({
  value: "",
  remainingTime: 0,
})

let intervalId: NodeJS.Timeout

const padNumber = (number: number) => number.toString().padStart(2, "0")

const updateToken = async (token: Token) => {
  const { value, remainingTime } = await getToken(token.otp)
  renderedToken.value = value
  renderedToken.remainingTime = remainingTime
}

const copy = async () => {
  navigator.clipboard.writeText(renderedToken.value)
  await useShowNotification(notification, {
    text: "Copied !",
    type: NotificationType.Success,
    delay: 2000,
  })
}

const getRemainingTime = (period: number = 30) => {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  return period - (nowInSeconds % period)
}

onMounted(async () => {
  if (token.value) {
    await updateToken(token.value)
    intervalId = setInterval(async () => {
      renderedToken.remainingTime = getRemainingTime(time.value)
      if (token && [1, DEFAULT_PERIOD].includes(renderedToken.remainingTime)) {
        await updateToken(token.value!)
      }
    }, 1000)
  }
})

onBeforeUnmount(() => {
  clearInterval(intervalId)
})
</script>
