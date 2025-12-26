<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { runMigrationIfNeeded } from '~/composables/useMigration'
import { triggerDebouncedSync, getSyncStatus, initFileWatcher, stopFileWatcher } from '~/composables/useSync'
import { store } from '~/composables/useStore'

const migrating = ref(false)

onMounted(async () => {
  cleanupInvalidTokens()

  migrating.value = true
  try {
    const result = await runMigrationIfNeeded()
    if (result?.migrated) {
      console.log(`Migrated ${result.tokensEncrypted} tokens to encrypted storage`)
    }
  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    migrating.value = false
  }

  await initFileWatcher()

  let previousTokens = JSON.stringify(store.getState().tokens)

  store.subscribe(async (state) => {
    const currentTokens = JSON.stringify(state.tokens)
    if (currentTokens !== previousTokens) {
      previousTokens = currentTokens

      const status = await getSyncStatus()
      if (status.enabled && status.autoSync) {
        triggerDebouncedSync()
      }
    }
  })
})

onUnmounted(() => {
  stopFileWatcher()
})
</script>
