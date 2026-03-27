<template>
  <div aria-live="assertive" class="pointer-events-none fixed inset-0 flex items-end px-4 py-4">
    <div class="flex w-full flex-col items-center">
      <transition enter-active-class="animate-fade-in-up" leave-active-class="animate-fade-out">
        <div
          class="pointer-events-auto w-full rounded-xl bg-vault-elevated border border-vault-border shadow-lg shadow-black/20 backdrop-blur-md"
        >
          <div class="p-3 flex items-center gap-3">
            <svg
              v-if="props?.type === NotificationType.Success"
              class="h-5 w-5 text-vault-success flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <svg
              v-if="props?.type === NotificationType.Danger"
              class="h-5 w-5 text-vault-danger flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <p class="text-sm font-medium text-vault-text flex-1">
              {{ props.text }}
            </p>
            <Loading v-if="props.withLoader" />
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  text: string
  show?: boolean
  type?: NotificationType
  withLoader?: boolean
}>()
</script>
