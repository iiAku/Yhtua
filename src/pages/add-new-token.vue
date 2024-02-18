<template>
  <button
    type="button"
    class="rounded-full m-5 bg-slate-600 p-2 text-white shadow-sm hover:bg-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
    v-on:click="backHome"
  >
    <ArrowLeftIcon class="h-5 w-5" aria-hidden="true" />
  </button>
  <div class="text-center">
    <div class="bg-white">
      <div class="mx-auto max-w-7xl sm:px-6 lg:px-8">
        <div
          class="relative isolate overflow-hidden bg-gray-900 px-6 py-24 shadow-2xl sm:rounded-3xl sm:px-24 xl:py-32"
        >
          <h2
            class="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Add a new 2FA Token
          </h2>
          <p
            class="mx-auto mt-2 max-w-xl text-center text-lg leading-8 text-gray-300"
          >
            You can add a new 2-Factor Authentication Token accounts such as
            Gmail, Facebook, Dropbox and many more using Yhtua . For the time
            being it is not possible to scan QR codes, but you can add accounts
            by entering the code provided by the service in which you want to
            enable 2FA.
          </p>
          <form class="mx-auto mt-10 flex max-w-md gap-x-4">
            <input
              id="code"
              name="code"
              type="code"
              autocomplete="code"
              required=""
              class="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6"
              placeholder="Enter your token security code"
            />
            <button
              type="submit"
              class="flex-none rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Add Token
            </button>
          </form>
          <svg
            viewBox="0 0 1024 1024"
            class="absolute left-1/2 top-1/2 -z-10 h-[64rem] w-[64rem] -translate-x-1/2"
            aria-hidden="true"
          >
            <circle
              cx="512"
              cy="512"
              r="512"
              fill="url(#759c1415-0410-454c-8f7c-9a820de03641)"
              fill-opacity="0.7"
            />
            <defs>
              <radialGradient
                id="759c1415-0410-454c-8f7c-9a820de03641"
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
                gradientTransform="translate(512 512) rotate(90) scale(512)"
              >
                <stop stop-color="#7775D6" />
                <stop offset="1" stop-color="#E935C1" stop-opacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
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
