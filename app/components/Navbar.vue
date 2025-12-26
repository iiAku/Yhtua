<template>
  <header class="bg-white">
    <nav
      class="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8"
      aria-label="Global"
    >
      <div class="flex">
        <button
          type="button"
          class="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
          @click="backHome"
        >
          <ArrowLeftIcon class="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div class="flex" v-if="props.tokenId">
        <button
          type="button"
          class="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
          @click="edit"
        >
          <PencilSquareIcon class="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/24/outline"
import { PencilSquareIcon } from "@heroicons/vue/20/solid"

const router = useRouter()

const props = defineProps<{
  tokenId?: string
}>()

const backHome = () => navigateTo("/")

const edit = () => router.push("/token/edit/" + props.tokenId)
</script>
