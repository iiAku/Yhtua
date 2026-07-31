import { describe, expect, it } from 'vitest'
import { parseBoundedJson } from './useBoundedJson'

describe('bounded JSON parser', () => {
  it('parses ordinary objects and ignores structural characters inside strings', () => {
    expect(parseBoundedJson('{"value":"[{}]"}', 100, 2)).toEqual({ value: '[{}]' })
  })

  it('rejects oversized and excessively nested input before JSON.parse', () => {
    expect(() => parseBoundedJson('{"value":"large"}', 4)).toThrow(/size limit/)
    expect(() => parseBoundedJson('[[[0]]]', 100, 2)).toThrow(/nested too deeply/)
  })

  it('rejects malformed structure', () => {
    expect(() => parseBoundedJson('{"value":1', 100)).toThrow(/malformed/)
    expect(() => parseBoundedJson(']', 100)).toThrow(/malformed/)
  })
})
