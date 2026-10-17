import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ENCRYPTED_BACKUP_BYTES } from '@yhtua/domain'

const fakes = vi.hoisted(() => ({
  pick: vi.fn(),
  share: vi.fn(),
  available: vi.fn(),
  importContent: vi.fn(),
  exportContent: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  size: 128,
}))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: fakes.pick }))
vi.mock('expo-sharing', () => ({ shareAsync: fakes.share, isAvailableAsync: fakes.available }))
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri = 'file:///cache/backup.json'
    get size() {
      return fakes.size
    }
    text = fakes.read
    write = fakes.write
    delete = fakes.remove
  },
}))
vi.mock('../src/transfer', () => ({
  importBackupContent: fakes.importContent,
  exportBackupContent: fakes.exportContent,
}))
import { importBackupFile, shareBackupFile } from '../src/transfer/files'

beforeEach(() => {
  vi.resetAllMocks()
  fakes.size = 128
  fakes.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/backup.json' }] })
  fakes.read.mockResolvedValue('encrypted JSON')
  fakes.importContent.mockResolvedValue({ success: true, tokensCount: 3 })
  fakes.exportContent.mockResolvedValue('encrypted JSON')
  fakes.available.mockResolvedValue(true)
})

describe('cloud backup file flow', () => {
  it('reads a provider file into the real import boundary and removes the temporary copy', async () => {
    await expect(importBackupFile('backup password')).resolves.toEqual({
      success: true,
      tokensCount: 3,
    })
    expect(fakes.pick).toHaveBeenCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    })
    expect(fakes.importContent).toHaveBeenCalledWith('encrypted JSON', 'backup password')
    expect(fakes.remove).toHaveBeenCalledOnce()
  })
  it('leaves the vault alone when file selection is cancelled', async () => {
    fakes.pick.mockResolvedValue({ canceled: true, assets: null })
    await expect(importBackupFile('password')).resolves.toBeNull()
    expect(fakes.importContent).not.toHaveBeenCalled()
    expect(fakes.remove).not.toHaveBeenCalled()
  })
  it('rejects an oversized file before reading and cleans up its cached copy', async () => {
    fakes.size = MAX_ENCRYPTED_BACKUP_BYTES + 1
    await expect(importBackupFile('password')).rejects.toThrow(/size limit/)
    expect(fakes.read).not.toHaveBeenCalled()
    expect(fakes.importContent).not.toHaveBeenCalled()
    expect(fakes.remove).toHaveBeenCalledOnce()
  })
  it('cleans up a cached import when the file cannot be read', async () => {
    fakes.read.mockRejectedValue(new Error('provider unavailable'))
    await expect(importBackupFile('password')).rejects.toThrow('provider unavailable')
    expect(fakes.remove).toHaveBeenCalledOnce()
  })
  it('shares only an encrypted export and removes it when the sheet closes', async () => {
    await shareBackupFile('backup password')
    expect(fakes.write).toHaveBeenCalledWith('encrypted JSON')
    expect(fakes.share).toHaveBeenCalledWith('file:///cache/backup.json', {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save encrypted Yhtua backup',
    })
    expect(fakes.remove).toHaveBeenCalledOnce()
  })
  it('cleans up when sharing fails and does not report success', async () => {
    fakes.share.mockRejectedValue(new Error('cannot share'))
    await expect(shareBackupFile('password')).rejects.toThrow('cannot share')
    expect(fakes.remove).toHaveBeenCalledOnce()
  })
  it('checks sharing availability before exporting secrets', async () => {
    fakes.available.mockResolvedValue(false)
    await expect(shareBackupFile('password')).rejects.toThrow(/unavailable/)
    expect(fakes.exportContent).not.toHaveBeenCalled()
    expect(fakes.write).not.toHaveBeenCalled()
  })
})
