<template>
  <ul role="list" class="divide-y divide-gray-100">
    <li
      v-for="token in filteredTokens"
      :key="token.otp.label"
      class="relative flex justify-between gap-x-6 py-5"
    >
      <div class="flex shrink-0 items-center">
        <span
          class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-500"
        >
          <span class="text-xl font-medium leading-none text-white">{{
            getAvatarPlaceholder(token.otp.label)
          }}</span>
        </span>
      </div>
      <div class="flex shrink-0 items-center">
        <p class="text-2xl font-semibold text-gray-600">
          <NuxtLink :to="`tokens/${token.id}`">
            <span class="absolute inset-x-0 -top-px bottom-0" />
            {{ token.otp.label.slice(0, 30) }}</NuxtLink
          >
        </p>
      </div>
      <div class="flex shrink-0 items-center">
        <ChevronRightIcon
          class="h-5 w-5 flex-none text-gray-400"
          aria-hidden="true"
        />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ChevronRightIcon } from "@heroicons/vue/20/solid"

const tokens: Token[] = getTokens()

const props = defineProps({
  searchQuery: String,
})

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
