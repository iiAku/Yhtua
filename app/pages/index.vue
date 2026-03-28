<template>
  <div class="h-screen flex flex-col bg-vault-base">
    <!-- Ambient glow -->
    <div
      class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-vault-accent/[0.03] rounded-full blur-[80px]"
    />

    <header
      class="relative z-10 bg-vault-base/80 backdrop-blur-md border-b border-vault-border px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <div class="flex-1 relative">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg
              class="h-4 w-4 text-vault-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </div>
          <input
            id="search"
            name="search"
            class="block w-full rounded-xl border-0 bg-vault-elevated py-2 pl-9 pr-3 text-vault-text text-sm font-medium placeholder:text-vault-text-muted ring-1 ring-inset ring-vault-border focus:ring-2 focus:ring-vault-accent/40 focus:bg-vault-surface transition-all"
            placeholder="Search tokens..."
            type="search"
            v-model="searchQuery"
          />
        </div>
        <button
          type="button"
          class="rounded-xl p-2 text-vault-text-secondary hover:text-vault-text hover:bg-vault-elevated border border-transparent hover:border-vault-border transition-all"
          aria-label="Settings"
          @click="openSettings"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="rounded-xl p-2 text-vault-accent hover:text-vault-accent-hover bg-vault-accent-subtle hover:bg-vault-accent/15 border border-vault-accent/10 hover:border-vault-accent/20 transition-all"
          aria-label="Add new token"
          @click="createNewToken"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-auto scrollbar-none px-3 relative z-10">
      <!-- Backup setup prompt -->
      <div
        v-if="showBackupPrompt"
        class="mx-1 mt-3 mb-1 bg-vault-accent-subtle border border-vault-accent/10 rounded-xl p-3 flex items-center gap-3 animate-fade-in-up"
      >
        <div
          class="w-8 h-8 rounded-lg bg-vault-accent/10 flex items-center justify-center flex-shrink-0"
        >
          <svg
            class="h-4 w-4 text-vault-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>
        </div>
        <p class="text-xs text-vault-accent flex-1 font-medium">
          Set up sync to keep your tokens backed up.
        </p>
        <div class="flex gap-1.5 flex-shrink-0">
          <button
            @click="navigateTo('/sync')"
            class="text-xs px-2.5 py-1 rounded-lg bg-vault-accent text-vault-base font-semibold hover:bg-vault-accent-hover transition-colors"
          >
            Set up
          </button>
          <button
            @click="dismissBackupPrompt"
            class="text-xs px-2 py-1 rounded-lg text-vault-text-muted hover:text-vault-text-secondary transition-colors"
          >
            Later
          </button>
        </div>
      </div>

      <TokenList :searchQuery="searchQuery" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getSyncStatus } from '~/composables/useSync'

definePageMeta({
  middleware: 'onboarding',
})

const searchQuery = ref('')
const showBackupPrompt = ref(false)
const createNewToken = () => navigateTo('/token/create')
const openSettings = () => navigateTo('/settings')

const BACKUP_PROMPT_DISMISSED_KEY = 'yhtua_backup_prompt_dismissed_at'
const BACKUP_REPROMPT_DAYS = 7

const dismissBackupPrompt = () => {
  showBackupPrompt.value = false
  localStorage.setItem(BACKUP_PROMPT_DISMISSED_KEY, String(Date.now()))
}

onMounted(async () => {
  const dismissedAt = Number(localStorage.getItem(BACKUP_PROMPT_DISMISSED_KEY) || '0')
  const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24)
  if (dismissedAt && daysSinceDismissed < BACKUP_REPROMPT_DAYS) return
  const status = await getSyncStatus()
  showBackupPrompt.value = !status.enabled && getTokens().length > 0
})
</script>

<style scoped>
input[type='search']::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
</style>
