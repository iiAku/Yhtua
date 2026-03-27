<template>
  <div class="h-screen flex flex-col bg-vault-base overflow-hidden">
    <Navbar :tokenId="token?.id" />

    <!-- Ambient glow -->
    <div
      class="pointer-events-none absolute inset-0 transition-opacity duration-1000"
      :style="{
        background: `radial-gradient(circle at 50% 40%, ${
          renderedToken.remainingTime <= 5
            ? 'rgba(239,68,68,0.08)'
            : copied
              ? 'rgba(74,222,128,0.08)'
              : 'rgba(212,175,85,0.04)'
        } 0%, transparent 60%)`,
      }"
    />

    <div class="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
      <!-- Loading -->
      <template v-if="loading">
        <Loading />
      </template>

      <!-- Error -->
      <template v-else-if="error">
        <div class="flex flex-col items-center gap-4 animate-fade-in-up">
          <div
            class="w-14 h-14 rounded-2xl bg-vault-danger-subtle border border-vault-danger/20 flex items-center justify-center"
          >
            <svg
              class="h-6 w-6 text-vault-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p class="text-vault-danger text-sm font-medium text-center">{{ error }}</p>
          <template v-if="isKeyLost">
            <p class="text-vault-text-secondary text-xs text-center max-w-xs leading-relaxed">
              Your encryption key was lost. If you have a sync backup, you can restore from it after
              resetting. Otherwise, tokens must be re-added manually.
            </p>
            <div class="flex gap-2">
              <button
                @click="navigateTo('/sync')"
                class="px-4 py-2 rounded-xl bg-vault-accent-subtle border border-vault-accent/20 text-vault-accent hover:bg-vault-accent/15 transition-colors text-sm font-medium"
              >
                Restore from backup
              </button>
              <button
                @click="resetEncryption"
                class="px-4 py-2 rounded-xl bg-vault-danger-subtle border border-vault-danger/20 text-vault-danger hover:bg-vault-danger/15 transition-colors text-sm font-medium"
              >
                Reset tokens
              </button>
            </div>
          </template>
          <button
            v-else
            @click="retry"
            class="px-4 py-2 rounded-xl bg-vault-elevated border border-vault-border text-vault-text-secondary hover:text-vault-text hover:border-vault-border-active transition-all text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </template>

      <!-- Token display -->
      <template v-else>
        <div class="flex flex-col items-center animate-fade-in-up">
          <!-- Circular timer with avatar -->
          <div class="relative mb-6">
            <svg class="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
              <!-- Background ring -->
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="text-vault-border"
              />
              <!-- Progress ring -->
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke-width="3"
                stroke-linecap="round"
                class="transition-all duration-1000 ease-linear"
                :class="
                  renderedToken.remainingTime <= 5
                    ? 'text-vault-danger'
                    : avatarTextClass(token?.otp.label ?? '')
                "
                :style="{
                  strokeDasharray: `${2 * Math.PI * 54}`,
                  strokeDashoffset: `${2 * Math.PI * 54 * (1 - renderedToken.remainingTime / (token?.otp.period ?? DEFAULT_PERIOD))}`,
                }"
                stroke="currentColor"
              />
            </svg>
            <!-- Avatar center -->
            <div class="absolute inset-0 flex items-center justify-center">
              <span
                class="inline-flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300"
                :class="
                  copied
                    ? 'bg-vault-success/10 border border-vault-success/20'
                    : 'bg-vault-elevated border border-vault-border'
                "
              >
                <svg
                  v-if="copied"
                  class="h-7 w-7 text-vault-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span
                  v-else
                  class="text-lg font-bold leading-none"
                  :class="avatarTextClass(token?.otp.label ?? '')"
                  >{{ getAvatarPlaceholder(token?.otp.label ?? '') }}</span
                >
              </span>
            </div>
          </div>

          <!-- Label -->
          <h3 class="text-sm font-medium text-vault-text-secondary tracking-wide">
            {{ token?.otp.label }}
          </h3>

          <!-- Token code -->
          <div class="flex items-center gap-4 my-5">
            <p
              class="text-5xl font-mono font-bold tracking-[0.15em] transition-colors duration-300"
              :class="
                copied
                  ? 'text-vault-success'
                  : renderedToken.remainingTime <= 5
                    ? 'text-vault-danger'
                    : 'text-vault-text'
              "
            >
              {{ formatCode(renderedToken.value) }}
            </p>
          </div>

          <!-- Copy button -->
          <button
            @click="copy"
            class="group flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200"
            :class="
              copied
                ? 'bg-vault-success/10 border border-vault-success/20 text-vault-success'
                : 'bg-vault-elevated border border-vault-border text-vault-text-secondary hover:text-vault-text hover:border-vault-accent/20 hover:bg-vault-hover'
            "
          >
            <svg
              v-if="copied"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
              />
            </svg>
            <span class="text-sm font-medium">
              {{ copied ? 'Copied!' : copyError ? 'Failed to copy' : 'Copy code' }}
            </span>
          </button>

          <!-- Timer text -->
          <div class="mt-5 flex items-center gap-2">
            <span
              class="font-mono text-xs font-medium tabular-nums transition-colors duration-1000"
              :class="
                renderedToken.remainingTime <= 5 ? 'text-vault-danger' : 'text-vault-text-muted'
              "
            >
              {{ padNumber(renderedToken.remainingTime) }}s remaining
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const route = useRoute()

const copied = ref(false)
const copyError = ref(false)
const loading = ref(true)
const error = ref('')

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
  try {
    const { value, remainingTime } = await getToken(token.otp)
    renderedToken.value = value
    renderedToken.remainingTime = remainingTime
    error.value = ''
  } catch (e) {
    console.error('Failed to generate token:', e)
    error.value = e instanceof Error ? e.message : String(e)
  }
}

const isKeyLost = computed(() => error.value.toLowerCase().includes('encryption key'))

const retry = async () => {
  if (!token.value) return
  loading.value = true
  error.value = ''
  await updateToken(token.value)
  loading.value = false
}

const resetEncryption = async () => {
  store.setState(defaultStore())
  await initializeEncryption()
  navigateTo('/')
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
    loading.value = false

    const period = token.value.otp.period ?? DEFAULT_PERIOD
    intervalId = setInterval(async () => {
      renderedToken.remainingTime = getRemainingTime(period)
      if (token.value && [1, period].includes(renderedToken.remainingTime)) {
        await updateToken(token.value!)
      }
    }, 1000)
  }
})

onBeforeUnmount(() => clearInterval(intervalId))
</script>
