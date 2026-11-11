import type { Messages } from '../types'

export default {
  windowClosedNotLoggedIn: 'La finestra di accesso è stata chiusa prima di completare l’accesso',
  expiredTitle: 'L’accesso a Bilibili è scaduto',
  title: 'Accedi a Bilibili',
  expiredSubtitle:
    'Accedi di nuovo per continuare ad analizzare e scaricare. I download in corso riprenderanno automaticamente dopo l’accesso.',
  subtitle: 'Scarica con il tuo account per ottenere la qualità 1080P e superiori e i contenuti Bilibili Premium.',
  fromBrowser: 'Importa da un browser',
  redetect: 'Rileva di nuovo',
  detecting: 'Ricerca dei browser…',
  loggedIn: 'Accesso a Bilibili effettuato',
  cannotImport: 'Impossibile importare',
  importing: 'Importazione',
  import: 'Importa',
  scanToLogin: 'Accedi con codice QR',
  pasteManually: 'Incolla manualmente',
  appBoundBanner:
    '{browsers} protegge i dati di accesso con la crittografia legata all’app: solo il browser stesso può leggerli e questa app non può importarli. Accedi con il codice QR, oppure copia i cookie dal browser e incollali manualmente.',
  openSystemSettings: 'Apri Impostazioni di Sistema',
  macBlocked:
    'macOS non consente a questa app di leggere i dati di {browsers}. Per importare da questi browser, attiva questa app in “Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco”, quindi riavviala. In alternativa, accedi direttamente dall’app qui sotto.',
  blocked:
    'Nessun permesso per leggere i dati di {browsers} (l’utente attuale non può leggere la cartella del profilo del browser). Puoi accedere direttamente dall’app qui sotto.',
  locked:
    '{browsers} è in esecuzione, quindi non è possibile leggerne i dati di accesso. Chiudi completamente il browser (anche i processi in background), poi fai clic su “Rileva di nuovo”.',
  lockedAppBound:
    'Le versioni recenti di Chrome ed Edge proteggono i dati di accesso con la crittografia legata all’app, quindi probabilmente non saranno leggibili nemmeno dopo la chiusura. Ti consigliamo di accedere con il codice QR.',
  noBrowserLoggedIn: 'Nessuno dei browser trovati ha effettuato l’accesso a Bilibili',
  noBrowserFound: 'Nessun browser supportato trovato',
  supported: ' (supportati: {browsers})',
  notLoggedInList: 'Accesso a Bilibili non effettuato: {list}',
  profileLabel: '{browser} ({profile})',
  inApp: 'Accedi nell’app',
  inAppHint: 'Codice QR, password o SMS. La finestra si chiude automaticamente dopo l’accesso',
  waitingLogin: 'In attesa dell’accesso',
  openLoginPage: 'Apri pagina di accesso',
  pasteCookie: 'Incolla i cookie manualmente',
  pasteHint:
    'Incolla un testo come “SESSDATA=…; bili_jct=…; DedeUserID=…”, oppure il JSON esportato da un’estensione come Cookie-Editor. I cookie equivalgono alle credenziali di accesso e vengono salvati solo su questo computer.',
  pasteStep1: 'Apri bilibili.com nel browser e verifica di aver effettuato l’accesso;',
  pasteStep2:
    'Premi F12 per aprire gli strumenti per sviluppatori e vai su “Applicazione” (Application) → Cookie → https://www.bilibili.com;',
  pasteStep3: 'Copia uno per uno i valori di SESSDATA, bili_jct e DedeUserID, componili nel formato indicato sopra e incollali qui.',
  verifying: 'Verifica…',
  loginWithCookie: 'Accedi con questi cookie'
} satisfies Messages['login']
