import type { Messages } from '../types'

export default {
  // errors.ts: errori del file system
  diskFull: 'Spazio su disco insufficiente',
  /** Aggiunto in coda agli errori seguenti per indicare il percorso */
  atPath: ': {path}',
  noWritePermission: 'Nessun permesso di scrittura{where}',
  readOnlyDisk: 'Il disco di destinazione è di sola lettura{where}',
  dirMissing: 'La cartella di download non esiste o il disco esterno è stato scollegato{where}',
  writeFailed: 'Scrittura del file non riuscita ({code}){where}',

  // extras.ts
  coverFailed: 'Download della copertina non riuscito: {error}',
  noCcSubtitle: 'Nessun sottotitolo CC',
  subtitleFailed: 'Recupero di sottotitoli/capitoli non riuscito: {error}',
  danmakuFailed: 'Download dei danmaku non riuscito: {error}',
  coverSaveFailed: 'Salvataggio della copertina non riuscito: {error}',
  subtitleSaveFailed: 'Salvataggio dei sottotitoli non riuscito: {error}',
  danmakuSaveFailed: 'Salvataggio dei danmaku non riuscito: {error}',
  nfoSaveFailed: 'Salvataggio NFO non riuscito: {error}',
  embedFallback: 'Impossibile incorporare copertina/sottotitoli/capitoli nel video: sono stati salvati separatamente',

  // fetchFile.ts
  sizeFailed: 'Impossibile ottenere la dimensione del file (HTTP {status})',
  connectFailed: 'Connessione al server di download non riuscita: {error}',
  timeout: 'Timeout della connessione',
  httpFailed: 'Download non riuscito (HTTP {status})',
  badRange: 'Il server ha restituito un intervallo di dati errato',
  interrupted: 'Connessione interrotta',
  incomplete: 'File incompleto ({done}/{total})',

  // manager.ts
  deleteFailed: 'Impossibile eliminare {count} file: {files}',
  busy: 'Questo video è in elaborazione, attendi che finisca',
  badRegion: 'Area della filigrana non valida',
  fileLocked: 'Il video originale è in uso da un altro programma e non è stato possibile sostituirlo',

  // mux.ts: errori di ffmpeg, action è uno dei tre valori seguenti
  actionMux: 'Unione',
  actionWatermark: 'Rimozione filigrana',
  actionRead: 'Lettura video',
  ffNoSpace: '{action} non riuscita: spazio su disco insufficiente',
  ffNoPermission: '{action} non riuscita: nessun permesso di scrittura nella cartella di destinazione',
  ffLogoOutside: '{action} non riuscita: la posizione della filigrana è fuori dall’immagine',
  ffEncoder: '{action} non riuscita: encoder non disponibile',
  ffCorrupt: '{action} non riuscita: il file scaricato è danneggiato, fai clic su “Scarica di nuovo”',
  ffContainer: 'Unione non riuscita: questo codec non è compatibile con il contenitore attuale, scegli MKV nelle impostazioni',
  ffExit: '{action} non riuscita (codice di uscita di ffmpeg {code}): {detail}',
  ffSpawn: 'Impossibile eseguire ffmpeg: {error}',
  muxTimeout: 'Timeout dell’unione: ffmpeg non risponde'
} satisfies Messages['download']
