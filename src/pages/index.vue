<template>
  <div class="px-4">
    <Popover as="template">
      <header class="sticky top-0bg-white shadow-sm">
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
            <div
              class="flex items-center md:absolute md:inset-y-0 md:right-0 lg:hidden"
            >
              <!-- Mobile menu button -->
              <button
                type="button"
                class="rounded-full bg-slate-600 p-2 text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                v-on:click="createNewToken"
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
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/vue/20/solid"

const searchQuery = ref("")
const createNewToken = () => navigateTo("/add-new-token")
</script>
