import type { Messages } from '../types'

export default {
  skipVersion: 'Skip this version',
  notNow: 'Not now',
  openDownloadPage: 'Go to download page',
  downloadAndInstall: 'Download and install',
  cancelDownload: 'Cancel download',
  downloadInBackground: 'Download in background',
  restartAndInstall: 'Restart and install',
  installingButton: 'Installing…',
  retry: 'Retry',
  title: 'New version {version} available',
  currentVersion: 'Current version: {version}',
  releasedOn: 'Released {date}',
  packageSize: 'Package size: {size}',
  noNotes: 'No release notes were provided for this version.',
  blocker: '{blocker}, or install it manually from the download page.',
  skipped: 'You skipped this version earlier, so automatic checks won’t remind you about it.',
  downloading: 'Downloading… It will continue even if you close this window',
  pendingTasks: {
    one: '{count} task is still unfinished. Restarting will pause it; you can resume it after the update.',
    other: '{count} tasks are still unfinished. Restarting will pause them; you can resume them after the update.'
  },
  ready: 'The new version has been downloaded and verified. Restart to start using it.',
  installing: 'Installing. The app will reopen automatically in a moment…'
} satisfies Messages['updateUi']
