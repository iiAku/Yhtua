import { encryptSecret, initializeEncryption, isEncryptionReady } from './useCrypto'
import { CURRENT_STORE_VERSION, getStoreVersion, StoreVersion, store, type Token } from './useStore'

export interface MigrationResult {
  migrated: boolean
  tokensEncrypted: number
  error?: string
}

export const needsMigration = (): boolean => getStoreVersion() < CURRENT_STORE_VERSION

export const hasPlaintextSecrets = (): boolean =>
  store.getState().tokens.some((token) => !token.otp.encrypted)

export const migrateToEncryptedStore = async (): Promise<MigrationResult> => {
  try {
    if (getStoreVersion() >= CURRENT_STORE_VERSION && !hasPlaintextSecrets()) {
      return { migrated: false, tokensEncrypted: 0 }
    }

    await initializeEncryption()

    const ready = await isEncryptionReady()
    if (!ready) {
      return {
        migrated: false,
        tokensEncrypted: 0,
        error: 'Failed to initialize encryption',
      }
    }

    const currentTokens = store.getState().tokens
    let encryptedCount = 0

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
        } catch (error) {
          console.error(`Failed to encrypt token ${token.id}:`, error)
          return token
        }
      }),
    )

    store.setState({
      version: CURRENT_STORE_VERSION,
      tokens: migratedTokens,
    })

    return {
      migrated: true,
      tokensEncrypted: encryptedCount,
    }
  } catch (error) {
    console.error('Migration failed:', error)
    return {
      migrated: false,
      tokensEncrypted: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const runMigrationIfNeeded = async (): Promise<MigrationResult | null> => {
  if (!needsMigration() && !hasPlaintextSecrets()) {
    return null
  }

  return migrateToEncryptedStore()
}
