import type { Messages } from '../types'

export default {
  noLoginCookie: 'Nessun accesso a YouTube trovato (manca SAPISID). Verifica di aver effettuato l’accesso a YouTube nel browser',
  verifyFailed: 'Impossibile verificare l’accesso a YouTube: {reason}',
  expired: 'Questo accesso a YouTube è scaduto. Accedi di nuovo a YouTube nel browser e importalo di nuovo',
  accountNotFound: 'Account YouTube non trovato',
  noLoginInBrowser: 'In questo profilo del browser non sono stati trovati dati di accesso a YouTube. Accedi prima a YouTube nel browser'
} satisfies Messages['ytLogin']
