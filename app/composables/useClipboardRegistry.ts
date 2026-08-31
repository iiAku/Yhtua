import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { clearOwnedClipboard } from './useOwnedClipboard'

// Page-independent registry of clipboard fingerprints Yhtua wrote, so the
// lock machine's WIPE_CLIPBOARD effect can clear owned values even after the
// page that copied them is gone. Only fingerprints are held, never codes.

// Entries expire unconditionally after the clear window: once the owned
// value cannot still be on the clipboard (it was cleared, or overwritten by
// unrelated content), holding its fingerprint serves nothing.
const REGISTRY_TTL_MS = 60_000

const ownedFingerprints = new Map<string, number>()

const evictExpired = () => {
  const now = Date.now()
  for (const [fingerprint, registeredAt] of ownedFingerprints) {
    if (now - registeredAt > REGISTRY_TTL_MS) ownedFingerprints.delete(fingerprint)
  }
}

export const registerOwnedClipboard = (fingerprint: string) => {
  evictExpired()
  ownedFingerprints.set(fingerprint, Date.now())
}

export const releaseOwnedClipboard = (fingerprint: string) => {
  ownedFingerprints.delete(fingerprint)
}

/** Clears the clipboard if it still holds any value Yhtua wrote. */
export const wipeOwnedClipboard = async (): Promise<void> => {
  evictExpired()
  for (const fingerprint of [...ownedFingerprints.keys()]) {
    try {
      const cleared = await clearOwnedClipboard(fingerprint, readText, writeText)
      if (cleared) ownedFingerprints.delete(fingerprint)
    } catch {
      // Clipboard access can fail transiently; the entry stays until the TTL
      // eviction removes it.
    }
  }
}
