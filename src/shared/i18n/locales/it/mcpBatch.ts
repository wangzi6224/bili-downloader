import type { Messages } from '../types'

export default {
  expanding:
    'Recupero delle parti dei video e aggiunta alla coda a blocchi ({done}/{total}); gli elementi già aggiunti iniziano subito a scaricare. Puoi attendere con wait_seconds',
  interruptedError: {
    one: 'Errore durante il recupero delle parti dei video ({error}): l’operazione si è fermata e {count} elemento non è ancora stato aggiunto alla coda; tra un po’ chiama control_tasks action=resume batch_id={id} per continuare',
    other:
      'Errore durante il recupero delle parti dei video ({error}): l’operazione si è fermata e {count} elementi non sono ancora stati aggiunti alla coda; tra un po’ chiama control_tasks action=resume batch_id={id} per continuare'
  },
  interruptedQuit: {
    one: 'Alla chiusura dell’app {count} elemento non era ancora stato aggiunto alla coda: chiama control_tasks action=resume batch_id={id} per continuare',
    other:
      'Alla chiusura dell’app {count} elementi non erano ancora stati aggiunti alla coda: chiama control_tasks action=resume batch_id={id} per continuare'
  },
  waitingAuth: 'Accesso scaduto: dopo un nuovo accesso si riprenderà automaticamente. {loginHint}',
  retrying: {
    one: 'Download in corso; {count} attività ha avuto un errore e attende la riprova automatica. Puoi attendere con wait_seconds',
    other: 'Download in corso; {count} attività hanno avuto un errore e attendono la riprova automatica. Puoi attendere con wait_seconds'
  },
  downloading: 'Download in corso, puoi attendere con wait_seconds',
  paused: {
    one: '{count} attività è in pausa (dopo il riavvio dell’app le attività non completate vengono messe in pausa automaticamente): chiama control_tasks action=resume batch_id={id} per continuare',
    other:
      '{count} attività sono in pausa (dopo il riavvio dell’app le attività non completate vengono messe in pausa automaticamente): chiama control_tasks action=resume batch_id={id} per continuare'
  },
  retryFailed: 'Chiama control_tasks action=retry batch_id={id} per riprovare quelle non riuscite',
  unsupported:
    'Le attività non scaricabili (unsupported) di solito richiedono Bilibili Premium, hanno restrizioni geografiche o sono contenuti a pagamento: riprovare non serve',
  allDownloaded: 'Gli elementi selezionati sono già stati tutti scaricati'
} satisfies Messages['mcpBatch']
