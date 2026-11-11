import type { Messages } from '../types'

export default {
  title: 'Link analizzati',
  subtitle:
    'Qui trovi tutti i link analizzati: fai clic su uno per riaprire la finestra di selezione e scaricare gli episodi rimanenti.',
  search: 'Cerca per titolo o link',
  clearConfirm: 'Cancellare tutti i link analizzati?',
  clear: 'Cancella',
  empty: 'Nessun link analizzato',
  emptyHint: 'Quando incolli e analizzi un link nella pagina Download, viene registrato qui automaticamente.',
  noMatch: 'Nessun risultato corrispondente',
  kindPgc: 'Anime / film e serie',
  kindVideo: 'Video',
  itemCount: { one: '{count} elemento', other: '{count} elementi' },
  remove: 'Elimina questo link'
} satisfies Messages['history']
