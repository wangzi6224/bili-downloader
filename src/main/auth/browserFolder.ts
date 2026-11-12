import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { resolve } from 'node:path'
import { t } from '@shared/i18n'
import type { BrowserProfile } from '@shared/types'
import { listBrowserProfiles, macBrowserFolders, preferredMacBrowserFolder } from './browserImport'
import { ImportError } from './importError'

export async function chooseBrowserFolder(profileId: string, win?: BrowserWindow | null): Promise<BrowserProfile[] | null> {
  const key = typeof profileId === 'string' ? profileId.split('::', 1)[0] : undefined
  const browser = key && preferredMacBrowserFolder(key)
  if (!browser) throw new Error(t('authErr.profileNotFound'))

  const opts: OpenDialogOptions = {
    defaultPath: browser.path,
    properties: ['openDirectory'],
    message: t('login.chooseBrowserFolderMessage', { path: browser.path })
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled) return null

  const path = result.filePaths[0]
  const selected = path && macBrowserFolders.find((folder) => folder.path === resolve(path))
  if (!selected) {
    throw new Error(t('login.wrongBrowserFolder', { path: browser.path }))
  }
  // The native picker grants access. Recheck in this process before showing any import action.
  const profiles = listBrowserProfiles()
  const selectedProfiles = profiles.filter((p) => p.id.startsWith(`${selected.key}::`))
  if (selectedProfiles.length && selectedProfiles.every((p) => p.blocked)) {
    throw new ImportError('blocked', t('authErr.noPermission', { browser: selectedProfiles[0].browser }))
  }
  return profiles
}
