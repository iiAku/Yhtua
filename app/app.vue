<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { runMigrationIfNeeded } from '~/composables/useMigration'
import { store } from '~/composables/useStore'
import {
  getSyncStatus,
  initFileWatcher,
  stopFileWatcher,
  triggerDebouncedSync,
} from '~/composables/useSync'

const migrating = ref(false)
let unsubscribeStore: (() => void) | null = null

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

  unsubscribeStore = store.subscribe(async (state) => {
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
  unsubscribeStore?.()
})
</script>
