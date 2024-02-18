<template>
  <button
    type="button"
    class="rounded-full m-5 bg-slate-600 p-2 text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
    v-on:click="backHome"
  >
    <ArrowLeftIcon class="h-5 w-5" aria-hidden="true" />
  </button>
  <div class="mt-20 mx-auto my-auto px-6 text-center lg:px-8">
    <span
      class="inline-flex h-48 w-48 items-center justify-center rounded-full bg-gray-500"
    >
      <span class="text-3xl font-medium leading-none text-white">TW</span>
    </span>

    <h3
      class="mt-6 text-base font-semibold leading-7 tracking-tight text-white"
    >
      {{ people[0].name }}
    </h3>
    <p class="text-7xl my-10 leading-6 text-gray-400">
      {{ sixDigitRandomNumber() }}
    </p>
    <p class="text-lg leading-6 my-20 text-gray-400">Changes in X Seconds</p>
  </div>
</template>

<script setup>
import { ArrowLeftIcon } from "@heroicons/vue/20/solid"

const sixDigitRandomNumber = () => {
  const randomNumber = Math.floor(100000 + Math.random() * 900000).toString()
  const firstPart = randomNumber.slice(0, 3)
  const secondPart = randomNumber.slice(3, 6)
  return `${firstPart} ${secondPart}`
}

const people = [
  {
    name: "Leonard Krasner",
    role: "Senior Designer",
    imageUrl:
      "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80",
    xUrl: "#",
    linkedinUrl: "#",
  },
  // More people...
]

const backHome = () => navigateTo("/")
</script>
