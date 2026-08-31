import { describe, expect, it, vi } from 'vitest'

vi.mock('./useCrypto', () => ({
  isEncryptionReady: vi.fn(async () => true),
}))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: vi.fn(async () => ''),
  writeText: vi.fn(async () => undefined),
}))
vi.mock('./useStore', () => ({
  getTokens: vi.fn(() => [{ id: 'token-1' }]),
}))
vi.mock('./useOTP', () => ({
  clearSecretCache: vi.fn(),
}))

import { clearSecretCache } from './useOTP'
import { dispatch, getLockState, startLockReporting } from './useLock'

// Pins the desktop adapter's REPORTING-MODE deviation explicitly: the machine
// runs and its security effects execute, but a locked state is immediately
// re-opened with a vacuous grant because desktop has no auth surface yet.
// Full enforcement (no auto-grant) is the mobile client's job.

describe('desktop lock adapter (reporting mode)', () => {
  it('hydrates, auto-grants the vacuous unlock, and clears the cache on real absences', async () => {
    // jsdom windows report unfocused; the adapter (correctly) treats that as
    // backgrounded, so pin a focused start for this scenario.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await startLockReporting()
    // Hydrated with a vault and key -> locked -> auto-granted to unlocked.
    expect(getLockState()).toBe('unlocked')

    dispatch({ type: 'APP_BACKGROUNDED' })
    expect(getLockState()).toBe('masked')
    expect(clearSecretCache).toHaveBeenCalledTimes(1)

    // A long absence re-locks; reporting mode immediately re-opens, but the
    // cache clearing already happened — the security effect is preserved.
    dispatch({ type: 'APP_FOREGROUNDED', elapsedMs: 10 * 60_000 })
    expect(getLockState()).toBe('unlocked')
  })
})
