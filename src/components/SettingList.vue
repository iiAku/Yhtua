<template>
  <ul role="list" class="divide-y divide-white/5">
    <li
      v-for="setting in settings"
      :key="setting.id"
      class="relative flex items-center space-x-4 py-4"
    >
      <div class="min-w-0 flex-auto">
        <div class="flex items-center gap-x-3">
          <h2 class="min-w-0 text-sm font-semibold leading-6 text-white">
            <a @click="setting.href" href="#" class="flex gap-x-2">
              <component :is="setting.icon" class="h-5 w-5" aria-hidden="true" />
              <span class="truncate">{{ setting.title }}</span>
              <span class="absolute inset-0" />
            </a>
          </h2>
        </div>
        <div
          class="mt-3 flex items-center gap-x-2.5 text-xs leading-5 text-gray-400"
        >
          <p class="truncate">{{ setting.description }}</p>
        </div>
      </div>
      <ChevronRightIcon
        class="h-5 w-5 flex-none text-gray-400"
        aria-hidden="true"
      />
    </li>
  </ul>
</template>

<script setup>
import { ChevronRightIcon } from "@heroicons/vue/20/solid"

defineProps({
  settings: {
    type: Array,
    required: true,
  },
})
</script>
