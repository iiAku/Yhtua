import type { CryptoPort } from '@yhtua/domain'
import { storagePort } from './storage'

// Port selection is FAIL-CLOSED: outside development, a missing native vault
// module is a hard error — the app must never fall back to the mock where a
// real secret could reach it. The native module arrives with the bridge
// phase; until then Expo Go development runs on the mock.

let cachedPort: CryptoPort | null = null

/** Test-only injection seam; production code must never call this. */
export const __setCryptoPortForTesting = (port: CryptoPort | null) => {
  cachedPort = port
}

export const getCryptoPort = (): CryptoPort => {
  if (cachedPort) return cachedPort
  // The native module's absence is only tolerable in development.
  const { nativeCryptoPort } = require('../../modules/yhtua-vault') as {
    nativeCryptoPort: CryptoPort | null
  }
  if (nativeCryptoPort) {
    cachedPort = nativeCryptoPort
    return cachedPort
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_USE_MOCK_VAULT !== 'false') {
    // Deliberately lazy so release bundles that never call this in dev mode
    // still carry no path to the mock.
    const { createMockCryptoPort } = require('./crypto.mock') as {
      createMockCryptoPort: typeof import('./crypto.mock').createMockCryptoPort
    }
    cachedPort = createMockCryptoPort(storagePort)
    return cachedPort
  }
  throw new Error('Native vault module is missing — refusing to run without real key custody')
}
