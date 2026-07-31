import { invoke } from '@tauri-apps/api/core'
import { encryptSecret, initializeEncryption, isEncryptionReady } from './useCrypto'
import { CURRENT_STORE_VERSION, getStoreVersion, store, type Token } from './useStore'

export interface MigrationResult {
  migrated: boolean
  tokensEncrypted: number
  failedTokenIds: string[]
  error?: string
}

export const needsMigration = (): boolean => getStoreVersion() < CURRENT_STORE_VERSION

export const hasPlaintextSecrets = (): boolean =>
  store.getState().tokens.some((token) => !token.otp.encrypted)

export const migrateToEncryptedStore = async (): Promise<MigrationResult> => {
  try {
    if (getStoreVersion() >= CURRENT_STORE_VERSION && !hasPlaintextSecrets()) {
      return { migrated: false, tokensEncrypted: 0, failedTokenIds: [] }
    }

    await initializeEncryption()

    const ready = await isEncryptionReady()
    if (!ready) {
      return {
        migrated: false,
        tokensEncrypted: 0,
        failedTokenIds: [],
        error: 'Failed to initialize encryption',
      }
    }

    const currentTokens = store.getState().tokens
    let encryptedCount = 0
    const failedTokenIds: string[] = []

    const migratedTokens: Token[] = await Promise.all(
      currentTokens.map(async (token) => {
        if (token.otp.encrypted) {
          return token
        }

        try {
          const encryptedSecret = await encryptSecret(token.otp.secret)
          encryptedCount++

          return {
            ...token,
            otp: {
              ...token.otp,
              secret: encryptedSecret,
              encrypted: true,
            },
          }
        } catch {
          console.error('Failed to encrypt a token during migration')
          failedTokenIds.push(token.id)
          return token
        }
      }),
    )

    store.setState({
      version: CURRENT_STORE_VERSION,
      tokens: migratedTokens,
    })

    if (failedTokenIds.length > 0) {
      console.warn(`Migration completed with ${failedTokenIds.length} failed tokens`)
    }

    return {
      migrated: true,
      tokensEncrypted: encryptedCount,
      failedTokenIds,
    }
  } catch (error) {
    console.error('Migration failed:', error)
    return {
      migrated: false,
      tokensEncrypted: 0,
      failedTokenIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

const stampUpdatedAtIfNeeded = () => {
  const tokens = store.getState().tokens
  const needsStamp = tokens.some((token) => token.updatedAt === undefined)
  if (!needsStamp) return

  const now = Date.now()
  store.setState({
    tokens: tokens.map((token) =>
      token.updatedAt !== undefined ? token : { ...token, updatedAt: now },
    ),
  })
}

const initTombstonesIfNeeded = () => {
  if (!store.getState().tombstones) {
    store.setState({ tombstones: [] })
  }
}

const LEGACY_CRYPTO_STORE_KEY = 'yhtua-key'

const migrateCredentialsToKeychain = async (): Promise<void> => {
  try {
    const raw = localStorage.getItem(LEGACY_CRYPTO_STORE_KEY)
    if (!raw) return

    const parsed = parseBoundedJson(raw, 64 * 1024, 8)
    if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return
    const state = parsed.state
    if (!state || typeof state !== 'object') return

    const encryptionKey =
      'encryptionKey' in state && typeof state.encryptionKey === 'string'
        ? state.encryptionKey
        : null
    const syncPassword =
      'syncPassword' in state && typeof state.syncPassword === 'string' ? state.syncPassword : null
    const syncPath =
      'syncPath' in state && typeof state.syncPath === 'string' ? state.syncPath : null
    if (!encryptionKey && !syncPassword && !syncPath) return

    await invoke('migrate_legacy_frontend_credentials', {
      encryptionKey,
      syncPassword,
      syncPath,
    })

    localStorage.removeItem(LEGACY_CRYPTO_STORE_KEY)
    console.log('Migrated credentials from localStorage to keychain')
  } catch (error) {
    // Keep localStorage intact so migration retries on next launch
    console.warn('Credential migration from localStorage failed (will retry next launch):', error)
  }
}

export const runMigrationIfNeeded = async (): Promise<MigrationResult | null> => {
  await migrateCredentialsToKeychain()
  initTombstonesIfNeeded()
  stampUpdatedAtIfNeeded()

  if (!needsMigration() && !hasPlaintextSecrets()) {
    return null
  }

  return migrateToEncryptedStore()
}
