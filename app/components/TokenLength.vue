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
          class="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vault-accent"
          :class="[
            checked
              ? 'bg-vault-accent text-vault-base ring-vault-accent font-semibold'
              : 'bg-vault-elevated text-vault-text-secondary ring-vault-border hover:bg-vault-hover hover:text-vault-text',
            'flex items-center justify-center rounded-xl py-2.5 px-3 text-sm font-medium ring-1 ring-inset transition-all',
          ]"
        >
          <RadioGroupLabel as="span">{{ option.name }}</RadioGroupLabel>
        </div>
      </RadioGroupOption>
    </div>
  </RadioGroup>
</template>

<script setup lang="ts">
import { RadioGroup, RadioGroupLabel, RadioGroupOption } from '@headlessui/vue'
import { computed } from 'vue'

const emit = defineEmits<{
  'update:modelValue': [digit: number]
}>()

const props = withDefaults(defineProps<{ modelValue?: number }>(), { modelValue: 6 })

const digits = [
  { name: '6-digit', type: 6 },
  { name: '7-digit', type: 7 },
  { name: '8-digit', type: 8 },
]

const digitModel = computed({
  get: () => digits.find(({ type }) => type === props.modelValue) ?? digits[0],
  set: (option) => {
    if (option) emit('update:modelValue', option.type)
  },
})
</script>
