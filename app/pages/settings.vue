<template>
  <div class="bg-gray-900 h-screen overflow-hidden">
    <DangerModal
      :type="modal.Danger.type"
      :title="modal.Danger.title"
      :text="modal.Danger.text"
      :validateTextButton="modal.Danger.validateTextButton"
      :cancelTextButton="modal.Danger.cancelTextButton"
      :open="modal.Danger.open"
      @close-modal="closeModal"
    />
    <Navbar />
    <div class="relative isolate overflow-hidden px-6 py-12">
      <h2
        class="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-white"
      >
        Yhtua Settings
      </h2>

      <div class="flex-col w-full my-6 px-8">
        <SettingList :settings="settings" />
        <Notification
          :text="notification.text"
          :type="notification.type"
          v-if="notification.show"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowDownOnSquareIcon, ArrowUpOnSquareIcon, TrashIcon} from '@heroicons/vue/24/outline';
const notification = useNotification()

const modal = useModal()

const showRemoveDialogue = () =>
  useShowModal(modal.value.Danger, {
    title: "Remove Token",
    text: "Are you sure you want to remove all of your tokens? This action cannot be undone.",
    validateTextButton: "Remove",
    cancelTextButton: "Cancel",
    type: "Danger",
  })

const closeModal = async (type: string, response: boolean) => {
  modal.value.Danger.open = false
  if (response) {
     await removeAllTokens(notification)
  }
}

const settings = [
  {
    id: "import",
    href: () => importTokens(notification),
    icon: ArrowDownOnSquareIcon,
    title: "Import Your Tokens",
    description: "Import your Yhtua token settings ",
  },
  {
    id: "export",
    href: () => exportTokens(notification),
    icon: ArrowUpOnSquareIcon,
    title: "Export Your Tokens",
    description: "Export your Yhtua token settings",
  },
  {
    id: "remove",
    href: () => showRemoveDialogue(),
    icon: TrashIcon,
    title: "Remove Your Tokens",
    description: "Remove your Yhtua token settings (this action is irreversible)",
  },
]
</script>
