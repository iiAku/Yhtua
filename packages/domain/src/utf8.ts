// Minimal UTF-8 encoder so the domain package has zero ambient runtime
// dependencies — TextEncoder exists in browsers, Node, and modern Hermes, but
// this package's portability contract is "standard ECMAScript only".
export const utf8Encode = (input: string): Uint8Array => {
  const bytes: number[] = []
  for (const character of input) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    }
  }
  return new Uint8Array(bytes)
}
