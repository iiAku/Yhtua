import { importPolicyScenarios, mergeScenarios } from '@yhtua/domain'
import { describe, expect, it } from 'vitest'
import { mergeTokens } from '~/composables/useMerge'
import { classifyImportJson } from '~/composables/useSettings'

// Desktop-side execution of the shared conformance scenarios through the APP's
// actual boundaries — the re-exported merge entry point and the real import
// routing used by useSettings — not the domain functions directly. The domain
// project runs the same fixtures under node; the mobile app runs them in its
// own suite. Divergence anywhere is a test failure.

describe('conformance (desktop boundary): merge scenarios', () => {
  it.each(mergeScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(mergeTokens(scenario.input)).toEqual(scenario.expected)
    },
  )
})

describe('conformance (desktop boundary): import policy scenarios', () => {
  it.each(importPolicyScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(classifyImportJson(JSON.stringify(scenario.payload)).kind).toBe(scenario.expected)
    },
  )
})
