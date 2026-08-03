import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearOwnedClipboard, clipboardFingerprint } from '../../app/composables/useOwnedClipboard'

const detailPage = readFileSync(join(process.cwd(), 'app', 'pages', 'tokens', '[id].vue'), 'utf8')

// A copied TOTP code is only useful if it is pasted into another app, which
// hides this window and unmounts nothing — but clearing on `document.hidden` or
// on unmount wiped it at exactly that moment, so copy looked instant and pasted
// nothing. The timed clear is the only correct trigger; these assertions exist
// because both of the wrong ones look like security improvements in review.
describe('clipboard auto-clear', () => {
  it('is driven only by the timer, not by hiding or unmounting', () => {
    const body = detailPage.slice(detailPage.indexOf('<script setup'))
    const clearCalls = body.match(/clearClipboard\(/g) ?? []

    // Exactly one call site, and it is the one inside the setTimeout.
    expect(clearCalls).toHaveLength(1)
    expect(body).toMatch(/setTimeout\(\(\) => void clearClipboard\(fingerprint\)/)
    expect(body).not.toMatch(/document\.hidden\)\s*void clearClipboard/)
  })

  it('leaves a clipboard the user has since overwritten alone', async () => {
    const writes: string[] = []
    const cleared = await clearOwnedClipboard(
      await clipboardFingerprint('our-code'),
      async () => 'something the user copied later',
      async (value) => void writes.push(value),
    )

    expect(cleared).toBe(false)
    expect(writes).toEqual([])
  })

  it('never holds the copied code, only its fingerprint', () => {
    const body = detailPage.slice(detailPage.indexOf('<script setup'))
    expect(body).toMatch(/clearTimer = setTimeout\(\(\) => void clearClipboard\(fingerprint\)/)
    expect(body).not.toMatch(/lastCopiedValue/)
  })
})
