import { invoke } from '@tauri-apps/api/core'

const REPORT_INTERVAL_MS = 100
const REPORT_ATTEMPTS = 100

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    if (!('__TAURI_INTERNALS__' in window)) return

    let attempts = 0
    const reportWhenReady = () => {
      attempts += 1
      const diagnostics = {
        url: window.location.href,
        readyState: document.readyState,
        nuxtChildCount: document.querySelector('#__nuxt')?.childElementCount ?? 0,
        bodyTextLength: document.body.innerText.trim().length,
        interactiveElementCount: document.querySelectorAll('button, input, a, select, textarea')
          .length,
      }

      if (
        diagnostics.readyState === 'complete' &&
        diagnostics.nuxtChildCount > 0 &&
        diagnostics.bodyTextLength >= 20 &&
        diagnostics.interactiveElementCount > 0
      ) {
        void invoke('report_ui_ready', diagnostics).catch(() => undefined)
        return
      }

      if (attempts < REPORT_ATTEMPTS) {
        window.setTimeout(reportWhenReady, REPORT_INTERVAL_MS)
      }
    }

    reportWhenReady()
  })
})
