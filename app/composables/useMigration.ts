import { encryptSecret, initializeEncryption, isEncryptionReady } from './useCrypto'
import { CURRENT_STORE_VERSION, getStoreVersion, StoreVersion, store, type Token } from './useStore'

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

    const ready = isEncryptionReady()
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
        } catch (error) {
          console.error(`Failed to encrypt token ${token.id}:`, error)
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
      console.warn(
        `Migration completed with ${failedTokenIds.length} failed tokens:`,
        failedTokenIds,
      )
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

export const runMigrationIfNeeded = async (): Promise<MigrationResult | null> => {
  initTombstonesIfNeeded()
  stampUpdatedAtIfNeeded()

  if (!needsMigration() && !hasPlaintextSecrets()) {
    return null
  }

  return migrateToEncryptedStore()
}
