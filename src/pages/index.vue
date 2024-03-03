<template>
  <div class="px-4 h-screen overflow-auto overscroll-none">
    <Popover as="template">
      <header class="sticky top-0 bg-white shadow-sm z-10">
        <div class="mx-auto max-w-7xl px-4 sm:px-6">
          <div class="relative flex justify-between">
            <div class="min-w-0 flex-1 md:px-8">
              <div
                class="flex items-center px-6 py-4 md:mx-auto md:max-w-3xl lg:mx-0 lg:max-w-none xl:px-0"
              >
                <div class="w-full">
                  <label for="search" class="sr-only">Search</label>
                  <div class="relative">
                    <div
                      class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
                    >
                      <MagnifyingGlassIcon
                        class="h-5 w-5 text-gray-400"
                        aria-hidden="true"
                      />
                    </div>
                    <input
                      id="search"
                      name="search"
                      class="block w-full rounded-md border-0 bg-white py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-slate-500 sm:text-sm sm:leading-6"
                      placeholder="Search"
                      type="search"
                      v-model="searchQuery"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-x-3">
              <button
                type="button"
                class="rounded-full bg-gray-600 p-2 text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                @click="openSettings"
              >
                <Cog6ToothIcon class="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                class="rounded-full bg-slate-600 p-2 text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                @click="createNewToken"
              >
                <PlusIcon class="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>
    </Popover>
    <TokenList :searchQuery="searchQuery" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { Popover } from "@headlessui/vue"
import { MagnifyingGlassIcon } from "@heroicons/vue/20/solid"
import { Cog6ToothIcon, PlusIcon } from "@heroicons/vue/24/outline"


definePageMeta({
  middleware: "onboarding",
})

const searchQuery = ref("")
const createNewToken = () => navigateTo("/token/create")
const openSettings = () => navigateTo("/settings")
</script>
