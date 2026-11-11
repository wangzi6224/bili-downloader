import type { Messages } from '../types'

export default {
  /** Mostrato quando l’API non fornisce l’etichetta dell’abbonamento */
  vipDefault: 'Bilibili Premium',
  notifyDoneTitle: 'Download completati',
  notifyDoneBody: { one: '{count} attività completata', other: 'Tutte le {count} attività sono state completate' },
  notifyFailedTitle: 'Download terminati, alcune attività non sono riuscite',
  notifyFailedBody: '{done} completate, {failed} non riuscite',
  notifySubsTitle: 'Nuovi contenuti nelle iscrizioni',
  notifySubsBody: {
    one: '“{title}” ha {count} nuovo contenuto, aggiunto ai download',
    other: '“{title}” ha {count} nuovi contenuti, aggiunti ai download'
  },
  fetchingParts: 'Recupero delle parti dei video',
  partsUnavailable: 'Impossibile recuperare {count} video ({reason})'
} satisfies Messages['misc']
