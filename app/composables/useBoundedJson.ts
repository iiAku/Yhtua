import { MAX_IMPORT_BYTES } from './useStore'

export const parseBoundedJson = (
  input: string,
  maxBytes: number = MAX_IMPORT_BYTES,
  maxDepth = 64,
): unknown => {
  if (new TextEncoder().encode(input).byteLength > maxBytes) {
    throw new Error('JSON input exceeds the size limit')
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (const character of input) {
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{' || character === '[') {
      depth += 1
      if (depth > maxDepth) throw new Error('JSON input is nested too deeply')
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth < 0) throw new Error('JSON input is malformed')
    }
  }
  if (inString || depth !== 0) throw new Error('JSON input is malformed')
  return JSON.parse(input) as unknown
}
