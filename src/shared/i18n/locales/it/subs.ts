import type { Messages } from '../types'

export default {
  interval30m: '30 minuti',
  interval1h: '1 ora',
  interval3h: '3 ore',
  interval6h: '6 ore',
  interval12h: '12 ore',
  interval1d: '24 ore',
  everyInterval: 'Ogni {interval}',
  title: 'Iscrizioni',
  subtitle:
    'Mentre l’app è in esecuzione, controlla a intervalli regolari fonti come cartelle dei preferiti, raccolte, anime e creator, e scarica automaticamente i nuovi contenuti con le opzioni scelte al momento dell’iscrizione.',
  empty: 'Nessuna iscrizione',
  emptyHint:
    'Dopo aver analizzato una cartella dei preferiti, una raccolta, un anime o la pagina di un creator, fai clic su “Iscriviti agli aggiornamenti” in fondo alla finestra di selezione.',
  enabled: 'Attiva',
  disabled: 'Disattivata',
  lastNew: {
    one: 'L’ultima volta è stato trovato {count} nuovo contenuto',
    other: 'L’ultima volta sono stati trovati {count} nuovi contenuti'
  },
  checking: 'Controllo…',
  checkNow: 'Controlla ora',
  unsubscribe: 'Annulla iscrizione',
  unsubscribeConfirm: 'Annullare l’iscrizione a “{title}”?'
} satisfies Messages['subs']
