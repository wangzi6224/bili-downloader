import type { Messages } from '../types'

export default {
  exportTitle: 'Esporta configurazione',
  importTitle: 'Importa configurazione',
  exported: 'Esportata in {path}',
  invalidJson: 'Questo file non è un JSON valido',
  notOurs: 'Questo non è un file di configurazione esportato da questa app',
  imported: {
    one: 'Importate le impostazioni e {count} iscrizione (esportate da {app} il {date})',
    other: 'Importate le impostazioni e {count} iscrizioni (esportate da {app} il {date})'
  },
  namingInvalid: 'Modello dei nomi non valido: {reason}'
} satisfies Messages['config']
