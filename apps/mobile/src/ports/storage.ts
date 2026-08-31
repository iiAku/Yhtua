import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StoragePort } from '@yhtua/domain'

// Non-secret vault index persistence (labels, issuers, YHL2 ciphertext
// blobs, tombstones). Ciphertext-at-rest is acceptable here; key custody is
// native-only. MMKV can replace this behind the same port once dev builds
// exist (it needs native code).
export const storagePort: StoragePort = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
}
