<template>
  <RadioGroup v-model="digitModel">
    <RadioGroupLabel class="sr-only">Token Length</RadioGroupLabel>
    <div class="grid grid-cols-3 gap-2">
      <RadioGroupOption
        as="template"
        v-for="option in digits"
        :key="option.name"
        :value="option"
        v-slot="{ checked }"
      >
        <div
          @click="$emit('digitSelected', option.type)"
          class="cursor-pointer focus:outline-none"
          :class="[
            checked
              ? 'bg-indigo-600 text-white ring-indigo-600'
              : 'bg-gray-800 text-gray-400 ring-gray-700 hover:bg-gray-700',
            'flex items-center justify-center rounded-lg py-2 px-3 text-sm font-medium ring-1 ring-inset transition-colors',
          ]"
        >
          <RadioGroupLabel as="span">{{ option.name }}</RadioGroupLabel>
        </div>
      </RadioGroupOption>
    </div>
  </RadioGroup>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { RadioGroup, RadioGroupLabel, RadioGroupOption } from "@headlessui/vue"

defineEmits<{
  digitSelected: [digit: number]
}>()

const digits = [
  { name: "6-digit", type: 6 },
  { name: "7-digit", type: 7 },
  { name: "8-digit", type: 8 },
]

const digitModel = ref(digits[0])
</script>
