import type { Messages } from '../types'

export default {
  title: 'Chiudi finestra',
  subtitle: 'In background i download e i controlli delle iscrizioni continuano; puoi riaprire la finestra tramite {reopenFrom}.',
  pendingTasks: {
    one: 'C’è ancora {count} attività non completata: uscendo completamente verrà messa in pausa e potrai riprenderla alla prossima apertura.',
    other:
      'Ci sono ancora {count} attività non completate: uscendo completamente verranno messe in pausa e potrai riprenderle alla prossima apertura.'
  },
  remember: 'Ricorda la mia scelta e non chiedere più',
  rememberHint: 'Puoi modificarla in seguito in “Impostazioni → Generali”',
  cancel: 'Annulla',
  quit: 'Esci completamente',
  background: 'Esegui in background'
} satisfies Messages['closeDialog']
