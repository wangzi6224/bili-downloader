import type { Messages } from '../types'

export default {
  skipVersion: 'Salta questa versione',
  notNow: 'Non ora',
  openDownloadPage: 'Vai alla pagina di download',
  downloadAndInstall: 'Scarica e installa',
  cancelDownload: 'Annulla download',
  downloadInBackground: 'Scarica in background',
  restartAndInstall: 'Riavvia e installa',
  installingButton: 'Installazione…',
  retry: 'Riprova',
  title: 'Nuova versione {version} disponibile',
  currentVersion: 'Versione attuale {version}',
  releasedOn: 'Pubblicata il {date}',
  packageSize: 'Pacchetto di installazione: {size}',
  noNotes: 'Questa versione non ha note di rilascio.',
  blocker: '{blocker}, oppure installala manualmente dalla pagina di download.',
  skipped: 'Hai saltato questa versione in precedenza: i controlli automatici non la segnalano più.',
  downloading: 'Download in corso… continua anche se chiudi la finestra',
  pendingTasks: {
    one: 'C’è ancora {count} attività non completata: il riavvio la metterà in pausa e potrai riprenderla dopo l’aggiornamento.',
    other: 'Ci sono ancora {count} attività non completate: il riavvio le metterà in pausa e potrai riprenderle dopo l’aggiornamento.'
  },
  ready: 'La nuova versione è stata scaricata e verificata: riavvia per usarla.',
  installing: 'Installazione in corso, l’app si riaprirà automaticamente tra poco…'
} satisfies Messages['updateUi']
