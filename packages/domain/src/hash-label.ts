/** Stable non-cryptographic hash of a label into `buckets` slots. Each client
 * maps the bucket to its own palette (Tailwind classes on desktop, style
 * objects on mobile). */
export const hashLabel = (label: string, buckets: number) => {
  let hash = 0
  for (const char of label) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash) % buckets
}
