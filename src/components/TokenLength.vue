<template>
  <RadioGroup v-model="digitModel">
    <RadioGroupLabel class="sr-only">Token Length</RadioGroupLabel>
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">
      <RadioGroupOption
        as="template"
        v-for="option in digits"
        :key="option.name"
        :value="option"
        v-slot="{ active, checked }"
      >
        <div
          @click="$emit('digitSelected', option.type)"
          class="cursor-pointer focus:outline-none"
          :class="[
            active ? 'ring-2 ring-slate-600 ring-offset-2' : '',
            checked
              ? 'bg-slate-600 text-white hover:bg-slate-500'
              : 'ring-1 ring-inset ring-gray-300 bg-white text-gray-900 hover:bg-gray-50',
            'flex items-center justify-center rounded-md py-3 px-3 text-sm font-semibold uppercase sm:flex-1',
          ]"
        >
          <RadioGroupLabel as="span">{{ option.name }}</RadioGroupLabel>
        </div>
      </RadioGroupOption>
    </div>
  </RadioGroup>
</template>

<script setup>
import { ref } from "vue"
import { RadioGroup, RadioGroupLabel, RadioGroupOption } from "@headlessui/vue"

const props = defineProps({
  tokenLength: {
    type: Number,
    required: true,
  },
})

const digits = [
  { name: "6-digit", type: 6 },
  { name: "7-digit", type: 7 },
  { name: "8-digit", type: 8 },
]

const digitModel = ref(digits[0])
</script>
