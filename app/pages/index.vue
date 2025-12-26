<template>
  <div class="h-screen flex flex-col bg-gray-900">
    <header class="bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon class="h-4 w-4 text-gray-500" aria-hidden="true" />
          </div>
          <input
            id="search"
            name="search"
            class="block w-full rounded-lg border-0 bg-gray-800 py-1.5 pl-9 pr-3 text-white text-sm placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            placeholder="Search tokens..."
            type="search"
            v-model="searchQuery"
          />
        </div>
        <button
          type="button"
          class="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          @click="openSettings"
        >
          <Cog6ToothIcon class="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          @click="createNewToken"
        >
          <PlusIcon class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
    <div class="flex-1 scrollbar-hide overflow-auto overscroll-none px-4">
      <TokenList :searchQuery="searchQuery" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { MagnifyingGlassIcon } from "@heroicons/vue/20/solid"
import { Cog6ToothIcon, PlusIcon } from "@heroicons/vue/24/outline"

definePageMeta({
  middleware: "onboarding",
})

const searchQuery = ref("")
const createNewToken = () => navigateTo("/token/create")
const openSettings = () => navigateTo("/settings")
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
