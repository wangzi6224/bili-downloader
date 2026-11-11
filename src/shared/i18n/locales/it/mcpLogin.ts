import type { Messages } from '../types'

export default {
  startTitle: 'Accedi a Bilibili',
  startDesc:
    'Usalo per accedere quando l’app non ha effettuato l’accesso. Per impostazione predefinita importa i dati di accesso dal browser dell’utente, nell’ordine Chrome, altri browser basati su Chrome, Opera, Firefox, Safari, usando prima quelli leggibili direttamente; i cookie restano salvati solo nell’app e non compaiono nel risultato. ' +
    'Se l’importazione non riesce, segui l’operazione indicata in next: con next=try_qr avvisa l’utente, poi usa method=qr per aprire la finestra con il codice QR e get_login_status con wait_seconds per attendere il completamento dell’accesso. ' +
    'Se l’accesso è già stato effettuato non fa nulla; per cambiare account l’utente deve farlo nell’app. Se il browser deve essere chiuso, è l’app a chiederlo all’utente stesso con una finestra di dialogo: qui non c’è un parametro per chiuderlo direttamente.',
  startMethod: 'browser importa dal browser (predefinito); qr apre la finestra di accesso per far scansionare il codice QR all’utente',
  startSource:
    'Browser da usare, ad esempio chrome, edge, opera, firefox, safari, oppure l’id di un profilo elencato da get_login_status. Se omesso viene scelto automaticamente',
  startWait:
    'Numero massimo di secondi di attesa, predefinito {n}. Ritorna subito quando l’accesso viene completato, non riesce o richiede un’azione dell’utente',

  statusTitle: 'Stato dell’accesso',
  statusDesc:
    'Mostra l’avanzamento di start_login. Con wait_seconds maggiore di 0 attende finché l’accesso riesce, non riesce o cambia stato: ritorna nell’istante in cui l’accesso riesce, e questa è la notifica che la scansione del codice QR è completata, più comoda di interrogazioni ripetute. ' +
    'Vale anche se l’utente accede da solo nell’app. Se allo scadere del tempo lo stato è ancora waiting_user, chiamalo di nuovo. Con include_browsers=true elenca i browser di questo computer e se contengono un accesso a Bilibili.',
  statusWait: 'Numero massimo di secondi di attesa, predefinito 0',
  statusBrowsers: 'Se elencare i browser di questo computer, predefinito false',

  // Passo successivo dopo un errore (in base a reason)
  hintLocked:
    'Il browser è in esecuzione. Puoi chiedere all’utente di chiuderlo completamente (anche i processi in background) e riprovare, oppure usare il codice QR',
  hintAppBound: 'Questo browser protegge i dati di accesso con la crittografia legata all’app e non sono leggibili: usa il codice QR',
  hintBlocked:
    'Nessun permesso per leggere i dati di questo browser. Su macOS bisogna concedere a {appName} l’“Accesso completo al disco” in Impostazioni di Sistema e riavviare l’app; sugli altri sistemi controlla i permessi della cartella. In alternativa usa il codice QR',
  hintNoLogin:
    'Il browser non contiene un accesso a Bilibili. Se l’utente ha appena effettuato l’accesso nel browser, attendi mezzo minuto e riprova (il browser non scrive subito i dati), oppure usa il codice QR',
  hintExpired: 'L’accesso a Bilibili nel browser è scaduto: usa il codice QR, oppure chiedi all’utente di accedere di nuovo nel browser',
  hintKeychainDenied:
    'L’utente non ha fatto clic su “Consenti” nella finestra del Portachiavi. Chiedi all’utente se vuole riprovare, oppure usa il codice QR',
  hintNetwork: 'Impossibile raggiungere Bilibili, oppure la richiesta è stata bloccata dai controlli antiabuso: attendi un po’ e riprova',
  hintDeclined:
    'L’utente non ha acconsentito a chiudere il browser: non riprovare ripetutamente. Chiedi all’utente se vuole accedere con il codice QR tramite start_login method=qr',
  hintConfirmTimeout:
    'L’utente non ha risposto alla finestra di dialogo, forse non l’ha vista. Avvisa l’utente di prestare attenzione e riprova, oppure usa il codice QR',
  hintCloseFailed: 'Non è stato possibile chiudere il browser. Puoi chiedere all’utente di chiuderlo manualmente e riprovare, oppure usare il codice QR',
  hintWindowClosed: 'L’utente ha chiuso la finestra di accesso. Chiedi all’utente se vuole riaprirla',
  hintNotFound: 'Puoi usare get_login_status include_browsers=true per vedere i browser di questo computer, oppure usare il codice QR',
  hintFailed: 'Puoi provare con un altro browser, oppure usare il codice QR',

  // Passi in corso
  stepChecking: 'Verifica dello stato di accesso in corso. Usa get_login_status wait_seconds=30 per attendere il risultato',
  stepImporting:
    'Lettura dei dati di accesso dal browser in corso. Su macOS potrebbe comparire la richiesta di autorizzazione del Portachiavi, su Linux potrebbe essere necessario sbloccare il portachiavi: ricorda all’utente di fare clic su “Consenti”. Usa get_login_status wait_seconds=30 per attendere il risultato',
  stepConfirmClose:
    'L’app ha mostrato una finestra di dialogo che chiede se chiudere il browser: ricorda all’utente di rispondere. Usa get_login_status wait_seconds=30 per attendere il risultato',
  stepClosingBrowser: 'L’utente ha acconsentito, chiusura del browser in corso. Usa get_login_status wait_seconds=30 per attendere il risultato',
  stepQr:
    'La finestra di accesso è aperta: di’ all’utente di scansionare il codice QR con l’app Bilibili. Usa get_login_status wait_seconds=50 per attendere il risultato: ritorna subito quando l’accesso riesce; se scade il tempo, chiamalo di nuovo',

  interrupted: 'Questi batch erano stati interrotti in precedenza: usa control_tasks action=resume batch_id=… per continuare',

  // Spiegazioni degli errori del flusso di accesso (snapshot.message)
  qrClosed: 'La finestra di accesso è stata chiusa prima di completare l’accesso',
  sourceNotFound: '“{source}” non trovato: puoi usare get_login_status include_browsers=true per vedere i browser di questo computer',
  appBoundLogin:
    'L’accesso a Bilibili in {browser} è salvato con la crittografia legata all’app e solo il browser stesso può leggerlo: usa il codice QR',
  appBoundLocked: '{browser} usa la crittografia legata all’app: molto probabilmente i dati di accesso non saranno leggibili nemmeno dopo la chiusura',
  browserRunning: '{browser} è in esecuzione: l’utente deve chiuderlo manualmente prima dell’importazione',
  noPermission: 'Nessun permesso per leggere i dati di {browser}',
  noLoginIn: '{browser} non contiene dati di accesso a Bilibili',
  noBrowser: 'Nessun browser supportato trovato',
  noLoginReadable: 'Nessuno dei browser leggibili contiene dati di accesso a Bilibili; manca il permesso di leggere {browser}',
  noLoginAny: 'Nessuno dei browser trovati contiene dati di accesso a Bilibili',
  confirmTimeout: 'L’utente non ha risposto alla finestra di dialogo che chiede se chiudere {browser}',
  declined: 'L’utente non ha acconsentito a chiudere {browser}',
  closeFailed: 'Non è stato possibile chiudere {browser}',
  closedNoLogin: '{browser} è stato chiuso, ma non contiene dati di accesso a Bilibili'
} satisfies Messages['mcpLogin']
