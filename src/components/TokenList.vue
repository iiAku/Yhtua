import type tokenVue from '~/pages/token.vue'
<template>
  <ul role="list" class="divide-y divide-gray-100">
    <li
      v-for="token in filteredTokens"
      :key="token.name"
      class="relative flex justify-between gap-x-6 py-5"
    >
      <div class="flex shrink-0 items-center">
        <span
          class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-500"
        >
          <span class="text-xl font-medium leading-none text-white">{{
            getAvatarPlaceholder(token.name)
          }}</span>
        </span>
      </div>
      <div class="flex shrink-0 items-center">
        <p class="text-2xl font-semibold text-gray-900">
          <NuxtLink :to="`${token.to}`">
            <span class="absolute inset-x-0 -top-px bottom-0" />
            {{ token.name }}</NuxtLink
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

<script setup>
import { ChevronRightIcon } from "@heroicons/vue/20/solid"

const tokens = [
  {
    name: "Bitwarden",
    to: "token",
  },
  {
    name: "Stripe",
    to: "token",
  },
  {
    name: "Cloudflare",
    to: "token",
  },
  {
    name: "Scaleway",
    to: "token",
  },
  {
    name: "LinkedIn",
    to: "token",
  },
  {
    name: "Amazon Web Services",
    to: "token",
  },
]

const props = defineProps({
  searchQuery: String,
})

// const tokens = [
//   {
//     name: "Bitwarden",
//   },
//   {
//     name: "Stripe",
//   },
//   {
//     name: "Dries Vincent",
//   },
//   {
//     name: "Cloudflare",
//   },
//   {
//     name: "LinkedIn",
//   },
//   {
//     name: "Kraken",
//   },
// ]

const getAvatarPlaceholder = (name) =>
  name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 3)
    .join("")

const filteredTokens = computed(() => {
  return tokens.filter((token) => {
    return token.name.toLowerCase().includes(props.searchQuery.toLowerCase())
  })
})
</script>
