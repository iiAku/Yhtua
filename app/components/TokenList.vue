<template>
  <div v-if="filteredTokens.length === 0" class="flex flex-col items-center justify-center py-16 px-4">
    <div class="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
      <ShieldCheckIcon class="h-8 w-8 text-gray-600" />
    </div>
    <h3 class="text-lg font-medium text-white mb-1">
      {{ searchQuery ? 'No tokens found' : 'No tokens yet' }}
    </h3>
    <p class="text-sm text-gray-400 text-center mb-6">
      {{ searchQuery ? 'Try a different search term' : 'Add your first 2FA token to get started' }}
    </p>
    <NuxtLink
      v-if="!searchQuery"
      to="/token/create"
      class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
    >
      <PlusIcon class="h-5 w-5" />
      Add Token
    </NuxtLink>
  </div>

  <ul v-else role="list" class="divide-y divide-gray-800 py-2">
    <li
      v-for="token in filteredTokens"
      :key="token.id"
      class="relative"
    >
      <NuxtLink
        :to="`/tokens/${token.id}`"
        class="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-gray-800 active:bg-gray-700 transition-colors"
      >
        <span
          class="inline-flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-gray-700"
        >
          <span class="text-sm font-medium leading-none text-white">{{
            getAvatarPlaceholder(token.otp.label)
          }}</span>
        </span>
        <span class="flex-1 min-w-0 text-sm font-medium text-white truncate">
          {{ token.otp.label }}
        </span>
        <ChevronRightIcon
          class="h-5 w-5 text-gray-500 flex-shrink-0"
          aria-hidden="true"
        />
      </NuxtLink>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ChevronRightIcon, PlusIcon, ShieldCheckIcon } from "@heroicons/vue/24/outline"

const tokens: Token[] = getTokens()

const props = defineProps<{
  searchQuery?: string
}>()

const filteredTokens = computed(() => {
  if (!props.searchQuery) {
    return tokens
  }
  return tokens.filter((token) => {
    return token.otp.label
      .toLowerCase()
      .includes(props.searchQuery!.toLowerCase())
  })
})
</script>
