import type { Messages } from '../types'

export default {
  ok: 'OK',
  cancel: 'Annulla',
  logoutMessage: 'Vuoi davvero uscire dall’account?',
  logoutDetail: 'Dopo l’uscita dovrai importare di nuovo i dati o accedere di nuovo.',
  logoutConfirm: 'Esci dall’account',
  upToDate: 'Hai già la versione più recente',
  currentVersion: 'Versione attuale {version}',
  quitPending: {
    one: 'C’è ancora {count} attività non completata. Vuoi davvero uscire?',
    other: 'Ci sono ancora {count} attività non completate. Vuoi davvero uscire?'
  },
  quitPendingDetail:
    'I download non completati verranno messi in pausa: alla prossima apertura fai clic su “Riprendi tutto” per continuare, senza perdere la parte già scaricata. I video in fase di rimozione della filigrana restano invariati.',
  runInBackground: 'Esegui in background',
  quit: 'Esci',
  closeBrowserMessage: 'Chiudere {browser} per importare i dati di accesso a Bilibili?',
  closeBrowserRequest:
    'L’assistente AI ha chiesto di importare i dati di accesso a Bilibili, ma {browser} è in esecuzione e i suoi dati non sono leggibili.',
  closeBrowserRisk:
    'Dopo la chiusura i contenuti non salvati potrebbero andare persi; se {browser} non si chiude in tempo, verrà terminato forzatamente.',
  closeBrowserAppBound: '{browser} usa la crittografia legata all’app: i dati di accesso potrebbero non essere leggibili nemmeno dopo la chiusura.',
  closeBrowserUnknown: 'Al momento non è certo che {browser} contenga dati di accesso a Bilibili.',
  closeBrowserConfirm: 'Chiudi {browser} e importa',
  useQrInstead: 'Usa il codice QR',
  loginWindowTitle: 'Accedi a Bilibili',
  chooseDownloadDir: 'Scegli cartella di download'
} satisfies Messages['dialogs']
