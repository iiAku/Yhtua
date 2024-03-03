<template>
  <div class="bg-gray-900 h-screen overflow-auto">
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
    <div class="text-center">
      <div class="relative isolate overflow-hidden bg-gray-900 px-6 py-24">
        <h2
          class="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-white sm:text-4xl"
        >
          Update an existing 2FA Token
        </h2>

        <div class="flex-col w-full my-6 px-8">
          <input
            v-model="token!.otp.label"
            class="my-2 min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6 w-full"
            placeholder="Enter your  Token Name"
          />

          <TokenLength class="my-2" @digitSelected="setDigit" />

          <button
            type="button"
            class="my-2 w-full justify-center inline-flex items-center gap-x-2 rounded-md bg-slate-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
            @click="updateToken(token!)"
          >
            <PlusCircleIcon class="-ml-0.5 h-5 w-5" aria-hidden="true" />
            Update token
          </button>
          <button
            type="button"
            class="my-2 w-full justify-center inline-flex items-center gap-x-2 rounded-md bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            @click="showRemoveDialogue()"
          >
            <TrashIcon class="-ml-0.5 h-5 w-5" aria-hidden="true" />
            Remove token
          </button>
        </div>
      </div>
    </div>
    <Notification
      :text="notification.text!"
      :withLoader="notification.withLoader"
      v-if="notification.show"
    />
  </div>
</template>

<script setup lang="ts">
import { PlusCircleIcon, TrashIcon } from "@heroicons/vue/20/solid"
import { ref } from "vue"

const route = useRoute()

const token = ref<Token | undefined>(
  store.getState().tokens.find((token) => token.id === route.params.id)
)

const notification = useNotification()

const modal = useModal()

const showRemoveDialogue = () =>
  useShowModal(modal.value.Danger, {
    title: "Remove Token",
    text: "Are you sure you want to remove this token? This action cannot be undone.",
    validateTextButton: "Remove",
    cancelTextButton: "Cancel",
    type: "Danger",
  })

const closeModal = async (type: string, response: boolean) => {
  modal.value.Danger.open = false
  if (response) {
    await removeToken(token.value!)
  }
}

const setDigit = (newDigit: number) => (token.value!.otp.digits = newDigit)

const updateToken = async (token: Token) => {
  const tokens = [...store.getState().tokens]
  const updatedToken = tokens.find((t) => t.id === token.id)
  if (!updatedToken) return

  updatedToken.otp.label = token.otp.label
  updatedToken.otp.digits = token.otp.digits

  await useShowNotification(notification, {
    text: "Token successfully updated",
    delay: 1500,
  })
}

const removeToken = async (token: Token) => {
  const tokens = [...store.getState().tokens]
  const removedToken = tokens.find((token) => token.id === token.id)
  if (!removedToken) return

  store.setState({
    tokens: tokens.filter((token) => token.id !== removedToken.id),
  })

  await useShowNotification(notification, {
    text: "Token successfully removed",
    delay: 1500,
    withLoader: true,
  })

  navigateTo(`/`)
}
</script>
