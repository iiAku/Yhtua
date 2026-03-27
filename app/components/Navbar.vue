<template>
  <header class="border-b border-vault-border bg-vault-surface/60 backdrop-blur-md">
    <nav class="flex items-center justify-between px-4 py-2.5" aria-label="Navigation">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-vault-text-secondary hover:text-vault-text transition-colors"
        aria-label="Go back"
        @click="goBack"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        <span class="text-sm font-medium">Back</span>
      </button>
      <button
        v-if="props.tokenId"
        type="button"
        class="inline-flex items-center rounded-lg p-1.5 text-vault-text-secondary hover:text-vault-accent transition-colors"
        aria-label="Edit token"
        @click="edit"
      >
        <svg
          class="h-4.5 w-4.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
          />
        </svg>
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
const router = useRouter()

const props = defineProps<{
  tokenId?: string
}>()

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    navigateTo('/')
  }
}

const edit = () => router.push(`/token/edit/${props.tokenId}`)
</script>
