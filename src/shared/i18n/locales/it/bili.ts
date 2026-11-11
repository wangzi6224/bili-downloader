import type { Messages } from '../types'

export default {
  // http.ts
  authExpired: 'Accesso scaduto, accedi di nuovo',
  riskControl: 'Richiesta bloccata dai controlli antiabuso di Bilibili (HTTP 412), riprova più tardi',
  serverError: 'Errore del server di Bilibili (HTTP {status})',
  networkFailed: 'Richiesta di rete non riuscita: {error}',
  wbiKeyFailed: 'Impossibile ottenere la chiave di firma WBI',
  badResponse: 'L’API ha restituito un contenuto non interpretabile (HTTP {status})',
  apiError: 'Errore dell’API ({code})',

  // Titoli dei gruppi nei risultati dell’analisi
  groupAudioMenu: 'Playlist',
  groupCourse: 'Corso',
  groupFav: 'Preferiti',
  groupSpace: 'Video caricati',
  groupSeason: 'Raccolta',
  groupSeries: 'Serie',
  groupWatchLater: 'Guarda più tardi',
  groupRank: 'Classifica: {label}',
  groupMain: 'Episodi principali',
  groupStein: 'Segmenti del video interattivo',
  groupPages: 'Parti',
  unavailable: 'Non disponibile',

  // lists.ts, lookup.ts, resolve.ts
  spaceRejected:
    'Bilibili ha temporaneamente rifiutato la richiesta dell’elenco dei video caricati dal creator ({error}); riprova più tardi, oppure incolla il link di una raccolta o di una cartella dei preferiti del creator',
  weeklyNoNumber: 'Impossibile ottenere il numero dell’edizione di “Da non perdere della settimana”',
  captcha: 'Bilibili ha richiesto una verifica anti-robot: questa ricerca non ha prodotto risultati',
  unrecognized: 'Nessun link di Bilibili riconosciuto (video, anime, corso, cartella dei preferiti o creator)',
  batchAllFailed: {
    one: 'L’analisi di {count} link non è riuscita: {error}',
    other: 'L’analisi di tutti i {count} link non è riuscita: {error}'
  },
  batchTitle: { one: 'Analisi multipla ({count} fonte)', other: 'Analisi multipla ({count} fonti)' },

  // Sezioni delle classifiche
  rankAll: 'Tutto il sito',
  rankDouga: 'Animazione',
  rankMusic: 'Musica',
  rankDance: 'Danza',
  rankGame: 'Videogiochi',
  rankKnowledge: 'Cultura',
  rankTech: 'Tecnologia',
  rankSports: 'Sport',
  rankCar: 'Auto',
  rankLife: 'Vita quotidiana',
  rankFood: 'Cucina',
  rankAnimal: 'Animali',
  rankKichiku: 'Kichiku (remix)',
  rankFashion: 'Moda',
  rankEnt: 'Intrattenimento',
  rankCinephile: 'Cinema e TV',
  rankOrigin: 'Originali',
  rankRookie: 'Nuovi creator',

  // Qualità audio
  audioBest: 'Migliore',
  audioFlac: 'Hi-Res lossless',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'Lossless',
  /** Qualità audio mostrata sull’attività; label ad esempio “320K” o “Lossless” */
  audioQuality: 'Audio {label}',
  audioNoUrl: 'Impossibile ottenere l’indirizzo di download di questo brano',
  audioNoUrlReason: 'Impossibile ottenere l’indirizzo di download di questo brano: {reason}',

  // danmaku.ts
  danmakuHttpFailed: 'Download dei danmaku non riuscito (HTTP {status})',

  // playurl.ts
  courseNoAccess: 'Nessun permesso di visione per questa lezione (potrebbe essere necessario acquistarla): {reason}',
  courseDrm: 'Questa lezione è protetta da DRM e non può essere scaricata',
  coursePreview: 'Con l’account attuale puoi vedere solo un’anteprima di questa lezione (è necessario acquistarla)',
  audioNotVideo: 'L’audio non usa l’API dei flussi video',
  regionLocked: 'Restrizione geografica: {reason}',
  needVip: 'Richiede Bilibili Premium: {reason}',
  drm: 'Questo contenuto è protetto da DRM e non può essere scaricato',
  previewOnly: 'Con l’account attuale puoi vedere solo un’anteprima di questo contenuto (serve Bilibili Premium o l’acquisto)',
  flvOnly: 'Questo video è disponibile solo nel vecchio formato FLV, non ancora supportato',
  noAudioTrack: 'Questo video non ha una traccia audio separata',
  noVideoStream: 'Nessun flusso video disponibile',
  codecFallback: 'Questa qualità non è disponibile in {wanted}, si usa {actual}',
  flacToMkv: 'La traccia Hi-Res lossless ha una scarsa compatibilità in MP4: si usa MKV',
  /** Indicatore “solo immagini” nell’etichetta della qualità */
  mute: 'senza audio'
} satisfies Messages['bili']
