<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
onMounted(() => {
  cleanupInvalidTokens()
})
</script>
