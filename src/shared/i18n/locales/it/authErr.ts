import type { Messages } from '../types'

export default {
  loginRequired: 'Effettua prima l’accesso',
  loginRequiredAccount: 'Accedi prima al tuo account Bilibili',
  loginExpired: 'Accesso scaduto, accedi di nuovo',
  appBoundCookie:
    'I cookie con crittografia legata all’app non possono essere importati: accedi dall’app o incolla i cookie manualmente',
  missingKey: 'Manca la chiave per decifrare {prefix}',
  incompleteCookie: 'Dati crittografati dei cookie di Chromium incompleti',
  /** Mostrato al posto del nome del profilo per i browser che non si possono leggere */
  blockedProfile: 'Nessun permesso di lettura',
  keychainNotFound: '“{service}” non trovato nel Portachiavi',
  keychainDenied: 'Autorizzazione del Portachiavi non ottenuta ({service}): fai clic su “Consenti” nella finestra di sistema',
  secretToolMissing:
    'Per leggere i dati di accesso dei browser basati su Chrome serve secret-tool: installalo prima (Debian / Ubuntu: sudo apt install libsecret-tools), oppure accedi dall’app',
  keyringNotFound:
    'Password del browser non trovata nel portachiavi di sistema (application={application}), oppure il portachiavi non è sbloccato. Puoi anche accedere dall’app',
  winKeyUnreadable:
    'Impossibile leggere la chiave di crittografia del browser su Windows: accedi dall’app o incolla i cookie manualmente',
  winKeyMissing: 'Il browser su Windows non ha una chiave DPAPI leggibile: accedi dall’app o incolla i cookie manualmente',
  winKeyUnsupported: 'Formato della chiave del browser su Windows non supportato: accedi dall’app o incolla i cookie manualmente',
  browserLocked:
    '{browser} è in esecuzione, quindi non è possibile leggerne i dati di accesso. Chiudi completamente {browser} (anche i processi in background) e poi importa, oppure accedi dall’app',
  profileNotFound: 'Profilo del browser non trovato, oppure manca il permesso di lettura',
  noPermission: 'Nessun permesso per leggere i dati di {browser}',
  noLogin: '{browser} ({profile}) non contiene dati di accesso a Bilibili',
  importedExpired:
    'I dati di accesso importati non sono più validi: accedi di nuovo a Bilibili nel browser, oppure accedi dall’app',
  cookieUnreadable:
    'Contenuto non riconosciuto: incolla cookie come “SESSDATA=…; bili_jct=…” oppure il JSON esportato da un’estensione',
  noSessdata: 'Manca SESSDATA, impossibile accedere',
  cookieExpired: 'Questi cookie non sono più validi, ottienine di nuovi',
  confirmTimeout: 'Timeout nella conferma dell’accesso, controlla la connessione',
  importCancelled: 'Importazione annullata',
  dpapiTimeout: 'Timeout nella decifratura DPAPI: accedi dall’app o incolla i cookie manualmente',
  dpapiFailed: 'Decifratura DPAPI non riuscita: {reason}',
  powershellExitCode: 'Codice di uscita di PowerShell {code}',
  dpapiIncomplete: 'PowerShell non ha restituito il risultato completo della decifratura',
  safariCorrupt: 'Il file dei cookie di Safari è danneggiato',
  notSafariCookies: 'Non è un file di cookie di Safari'
} satisfies Messages['authErr']
