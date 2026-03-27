<template>
  <TransitionRoot as="template" :show="open">
    <Dialog as="div" class="relative z-50" @close="$emit('close-modal', props.type, false)">
      <TransitionChild
        as="template"
        enter="ease-out duration-200"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in duration-150"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" />
      </TransitionChild>

      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="ease-out duration-200"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="ease-in duration-150"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel
              class="relative w-full max-w-sm overflow-hidden rounded-2xl bg-vault-surface border border-vault-border p-5 shadow-2xl shadow-black/30"
            >
              <div class="flex flex-col items-center text-center">
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-2xl bg-vault-danger-subtle border border-vault-danger/20 mb-4"
                >
                  <ExclamationTriangleIcon class="h-6 w-6 text-vault-danger" aria-hidden="true" />
                </div>
                <DialogTitle as="h3" class="text-base font-semibold text-vault-text">
                  {{ title }}
                </DialogTitle>
                <p class="mt-2 text-sm text-vault-text-secondary leading-relaxed">
                  {{ text }}
                </p>
              </div>
              <div class="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-xl bg-vault-elevated border border-vault-border px-4 py-2.5 text-sm font-medium text-vault-text-secondary hover:text-vault-text hover:bg-vault-hover transition-colors"
                  @click="$emit('close-modal', props.type, false)"
                  ref="cancelButtonRef"
                >
                  {{ cancelTextButton }}
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-vault-danger/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-danger transition-colors"
                  @click="$emit('close-modal', props.type, true)"
                >
                  {{ validateTextButton }}
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  open: boolean
  type: string
  title: string
  text: string
  validateTextButton: string
  cancelTextButton: string
}>()

defineEmits<{
  'close-modal': [name: string, confirmed: boolean]
}>()
</script>
