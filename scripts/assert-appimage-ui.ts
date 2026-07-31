const port = Number(Bun.argv[2])

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Usage: bun scripts/assert-appimage-ui.ts <inspector-port>')
}

const inspectorUrl = `http://127.0.0.1:${port}/`
const inspectorPage = await fetch(inspectorUrl).then((response) => {
  if (!response.ok) throw new Error(`Inspector returned HTTP ${response.status}`)
  return response.text()
})
const socketPath = inspectorPage.match(/window\.location\.host \+ '([^']+)'/)?.[1]

if (!socketPath) {
  throw new Error('No inspectable WebKit page target was found')
}

type TargetCreated = {
  method: 'Target.targetCreated'
  params: { targetInfo: { targetId: string; type: string } }
}

type TargetMessage = {
  method: 'Target.dispatchMessageFromTarget'
  params: { targetId: string; message: string }
}

type EvaluationResult = {
  result?: {
    result?: { type?: string; value?: string }
    wasThrown?: boolean
  }
  error?: { message?: string }
}

const diagnostics = await new Promise<{
  url: string
  readyState: string
  nuxtChildCount: number
  bodyTextLength: number
  interactiveElementCount: number
}>((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`)
  let pageTarget: string | undefined
  const timeout = setTimeout(() => {
    socket.close()
    reject(new Error('Timed out while evaluating the packaged application UI'))
  }, 10_000)

  const finish = (callback: () => void) => {
    clearTimeout(timeout)
    socket.close()
    callback()
  }

  socket.onerror = () => finish(() => reject(new Error('WebKit inspector connection failed')))
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as TargetCreated | TargetMessage

    if (message.method === 'Target.targetCreated') {
      const target = message.params.targetInfo
      if (target.type !== 'page' || pageTarget) return
      pageTarget = target.targetId

      const evaluation = {
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `JSON.stringify({
            url: location.href,
            readyState: document.readyState,
            nuxtChildCount: document.querySelector('#__nuxt')?.childElementCount ?? 0,
            bodyTextLength: document.body.innerText.trim().length,
            interactiveElementCount: document.querySelectorAll('button, input, a, select, textarea').length
          })`,
          returnByValue: true,
        },
      }

      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Target.sendMessageToTarget',
          params: { targetId: pageTarget, message: JSON.stringify(evaluation) },
        }),
      )
      return
    }

    if (message.method !== 'Target.dispatchMessageFromTarget') return
    const evaluation = JSON.parse(message.params.message) as EvaluationResult
    const value = evaluation.result?.result?.value
    if (evaluation.error || evaluation.result?.wasThrown || typeof value !== 'string') {
      finish(() => reject(new Error(evaluation.error?.message ?? 'Packaged UI evaluation failed')))
      return
    }

    finish(() => resolve(JSON.parse(value)))
  }
})

if (
  !diagnostics.url.startsWith('tauri://localhost/') ||
  diagnostics.readyState !== 'complete' ||
  diagnostics.nuxtChildCount < 1 ||
  diagnostics.bodyTextLength < 20 ||
  diagnostics.interactiveElementCount < 1
) {
  throw new Error(`Packaged application did not render a usable UI: ${JSON.stringify(diagnostics)}`)
}

console.log(`Packaged application UI rendered successfully: ${JSON.stringify(diagnostics)}`)
