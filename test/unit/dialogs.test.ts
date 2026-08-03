import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appDirectory = join(process.cwd(), 'app')

const vueFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })

// Headless UI throws "You forgot to provide an `open` prop to the `Dialog`" during
// setup, which silently aborts the render: the modal never appears and the click
// looks like a no-op. Guard every <Dialog> that is not driven by a <TransitionRoot>.
describe('Headless UI dialogs', () => {
  it('always control their open state', () => {
    const offenders = vueFiles(appDirectory).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      if (source.includes('<TransitionRoot')) return []
      const tags = source.match(/<Dialog[\s>][^>]*>/g) ?? []
      return tags.some((tag) => tag.includes('open=')) ? [] : tags
    })

    expect(offenders).toEqual([])
  })
})
