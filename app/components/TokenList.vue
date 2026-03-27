<template>
  <div
    v-if="filteredTokens.length === 0 && searchQuery"
    class="flex flex-col items-center justify-center py-20 px-4"
  >
    <div
      class="w-14 h-14 rounded-2xl bg-vault-elevated border border-vault-border flex items-center justify-center mb-4"
    >
      <svg
        class="h-6 w-6 text-vault-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>
    </div>
    <p class="text-sm font-medium text-vault-text-secondary">No tokens found</p>
    <p class="text-xs text-vault-text-muted mt-1">Try a different search term</p>
  </div>

  <ul v-else role="list" class="py-2 space-y-1">
    <li
      v-for="(token, index) in filteredTokens"
      :key="token.id"
      class="animate-fade-in-up"
      :style="{ animationDelay: `${index * 30}ms` }"
    >
      <NuxtLink
        :to="`/tokens/${token.id}`"
        class="group flex items-center gap-3 py-2.5 px-3 rounded-xl border border-transparent hover:bg-vault-elevated hover:border-vault-border active:scale-[0.99] transition-all duration-150"
      >
        <span
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 border transition-colors"
          :class="avatarBgClass(token.otp.label)"
        >
          <span
            class="text-xs font-semibold leading-none"
            :class="avatarTextClass(token.otp.label)"
            >{{ getAvatarPlaceholder(token.otp.label) }}</span
          >
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium text-vault-text truncate">
            {{ token.otp.label }}
          </span>
          <span class="block text-xs text-vault-text-muted mt-0.5 font-mono">
            {{ token.otp.digits }}-digit · {{ token.otp.period ?? 30 }}s
          </span>
        </span>
        <svg
          class="h-4 w-4 text-vault-text-muted group-hover:text-vault-accent transition-colors flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </NuxtLink>
    </li>
  </ul>
</template>

<script setup lang="ts">
const props = defineProps<{
  searchQuery?: string
}>()

const filteredTokens = computed(() => {
  const tokens = getTokens()
  if (!props.searchQuery) {
    return tokens
  }
  return tokens.filter((token) => {
    return token.otp.label.toLowerCase().includes(props.searchQuery!.toLowerCase())
  })
})
</script>
