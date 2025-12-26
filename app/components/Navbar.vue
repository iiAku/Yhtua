<template>
  <header class="bg-gray-900/50 backdrop-blur-sm border-b border-gray-800">
    <nav
      class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3"
      aria-label="Global"
    >
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        @click="goBack"
      >
        <ChevronLeftIcon class="h-5 w-5" aria-hidden="true" />
        <span class="text-sm font-medium">Back</span>
      </button>
      <button
        v-if="props.tokenId"
        type="button"
        class="inline-flex items-center rounded-lg px-2 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        @click="edit"
      >
        <PencilSquareIcon class="h-5 w-5" aria-hidden="true" />
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { ChevronLeftIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'

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
