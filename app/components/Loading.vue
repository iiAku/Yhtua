<template>
  <div class="flex items-center gap-1">
    <span
      v-for="i in 3"
      :key="i"
      class="w-1.5 h-1.5 rounded-full bg-vault-text-secondary animate-shimmer"
      :style="{ animationDelay: `${(i - 1) * 200}ms` }"
    />
  </div>
</template>
