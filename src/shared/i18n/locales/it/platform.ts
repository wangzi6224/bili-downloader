import type { Messages } from '../types'

export default {
  macFileManager: 'Finder',
  macReopenFrom: 'il Dock o l’icona nella barra dei menu',
  macAv1Hint: 'Occupa meno spazio, richiede un Mac con M1 o successivo',
  macChromiumAuthHint:
    'Quando importi da un browser basato su Chrome, macOS chiede l’autorizzazione del Portachiavi: fai clic su “Consenti”.',
  linuxFileManager: 'file manager',
  linuxChromiumAuthHint:
    'I dati di accesso dei browser basati su Chrome sono nel portachiavi di sistema: se durante l’importazione viene chiesto di sbloccarlo, inserisci la password di accesso.',
  winFileManager: 'Esplora file',
  winChromiumAuthHint:
    'L’importazione usa l’identità dell’utente Windows attuale per decifrare la chiave del browser, senza richieste di autorizzazione.',
  trayIcon: 'l’icona nell’area di notifica',
  av1Hint: 'Occupa meno spazio, ma sui computer meno recenti la riproduzione può scattare'
} satisfies Messages['platform']
