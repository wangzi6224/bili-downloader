import type { Messages } from '../types'

export default {
  separator: '; ',
  parseFailures: 'Impossibile analizzare {count} link: {errors}',
  watchLater: 'Guarda più tardi',
  popular: 'Popolari',
  weekly: 'Da non perdere della settimana (ultima edizione)',
  rank: 'Classifica: {name}',
  myFavorites: 'I miei preferiti',
  loading: 'Caricamento…',
  noFavorites: 'Nessuna cartella dei preferiti',
  myMenu: 'Guarda più tardi, Popolari, I miei preferiti',
  myMenuLoggedOut: 'Disponibili dopo l’accesso: Guarda più tardi, Popolari, I miei preferiti',
  batchTitle: 'Analisi multipla',
  batchSubtitle:
    'Un link per riga (codici BV, anime, cartelle dei preferiti, creator: va bene tutto); verranno analizzati uno per uno e riuniti in un’unica selezione.',
  detectedLinks: { one: '{count} link rilevato', other: '{count} link rilevati' },
  cancel: 'Annulla',
  parseCount: 'Analizza {count}',
  placeholder: 'Incolla il link di un video, raccolta, anime, corso, cartella dei preferiti o creator',
  pasteAndParse: 'Incolla dagli appunti e analizza',
  clearLink: 'Cancella il link',
  parsing: 'Analisi',
  parse: 'Analizza',
  batchButton: 'Analisi multipla: incolla più link, uno per riga',
  parsingProgress: 'Analisi {done}/{total}',
  clipboardLinks: 'Negli appunti ci sono {count} link',
  clipboardLink: 'Link rilevato negli appunti'
} satisfies Messages['input']
