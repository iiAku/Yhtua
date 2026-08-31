import { describe, expect, it } from 'vitest'
import {
  classifyImportPayload,
  evaluateMergeScenario,
  importPolicyScenarios,
  mergeScenarios,
} from '../src'

// The same scenarios run in every client's suite (app project today, the
// mobile app from its first release) — a divergence is a test failure there.

describe('conformance: merge scenarios', () => {
  it.each(mergeScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(evaluateMergeScenario(scenario)).toEqual(scenario.expected)
    },
  )
})

describe('conformance: import policy scenarios', () => {
  it.each(importPolicyScenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      expect(classifyImportPayload(scenario.payload)).toBe(scenario.expected)
    },
  )
})
