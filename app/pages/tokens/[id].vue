<template>
  <div class="h-screen flex flex-col bg-gray-900">
    <Navbar :tokenId="token?.id" />
    <div class="flex-1 flex flex-col items-center justify-center px-6">
      <span
        class="inline-flex h-20 w-20 items-center justify-center rounded-full transition-colors"
        :class="copied ? 'bg-green-600' : 'bg-gray-700'"
      >
        <CheckIcon v-if="copied" class="h-10 w-10 text-white" />
        <span v-else class="text-2xl font-medium leading-none text-white">{{
          getAvatarPlaceholder(token?.otp.label ?? "")
        }}</span>
      </span>

      <h3 class="mt-4 text-sm font-medium tracking-tight text-gray-400">
        {{ token?.otp.label }}
      </h3>

      <div class="flex items-center gap-4 my-6">
        <p
          class="text-6xl font-mono font-bold tracking-widest transition-colors duration-200"
          :class="copied ? 'text-green-400' : 'text-white'"
        >
          {{ formatCode(renderedToken.value) }}
        </p>
        <button
          @click="copy"
          class="p-3 rounded-lg transition-all duration-200"
          :class="copied ? 'bg-green-600 text-white scale-110' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'"
        >
          <CheckIcon v-if="copied" class="h-6 w-6" />
          <ClipboardDocumentIcon v-else class="h-6 w-6" />
        </button>
      </div>

      <div class="h-5 -mt-2 mb-4">
        <p
          v-if="copied"
          class="text-green-400 text-sm font-medium text-center"
        >
          Copied to clipboard!
        </p>
        <p
          v-else-if="copyError"
          class="text-red-400 text-sm font-medium text-center"
        >
          Failed to copy
        </p>
      </div>

      <div class="mt-2">
        <div class="flex items-center gap-2 text-gray-500 text-sm">
          <div class="w-24 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-1000 ease-linear"
              :class="renderedToken.remainingTime <= 5 ? 'bg-red-500' : 'bg-indigo-500'"
              :style="{ width: `${(renderedToken.remainingTime / time) * 100}%` }"
            />
          </div>
          <span
            class="font-mono w-6 text-center"
            :class="renderedToken.remainingTime <= 5 ? 'text-red-400' : 'text-gray-500'"
          >
            {{ padNumber(renderedToken.remainingTime) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const route = useRoute()

const time = ref(DEFAULT_PERIOD)
const copied = ref(false)
const copyError = ref(false)

const token = ref<Token | undefined>(
  store.getState().tokens.find((token) => token.id === route.params.id),
)

if (!token.value) {
  navigateTo('/')
}

const renderedToken = reactive({
  value: '',
  remainingTime: 0,
})

let intervalId: NodeJS.Timeout

const padNumber = (number: number) => number.toString().padStart(2, '0')

const formatCode = (code: string) => {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`
  return code
}

const updateToken = async (token: Token) => {
  const { value, remainingTime } = await getToken(token.otp)
  renderedToken.value = value
  renderedToken.remainingTime = remainingTime
}

const copy = async () => {
  try {
    await writeText(renderedToken.value)
    copied.value = true
    copyError.value = false
    await useSleep(2000)
    copied.value = false
  } catch (error) {
    console.error('Failed to copy:', error)
    copyError.value = true
    await useSleep(2000)
    copyError.value = false
  }
}

onMounted(async () => {
  if (token.value) {
    updateTokenLastUsed(token.value.id)
    await updateToken(token.value)

    intervalId = setInterval(async () => {
      renderedToken.remainingTime = getRemainingTime(time.value)
      if (token.value && [1, DEFAULT_PERIOD].includes(renderedToken.remainingTime)) {
        await updateToken(token.value!)
      }
    }, 1000)
  }
})

onBeforeUnmount(() => {
  clearInterval(intervalId)
})
</script>
