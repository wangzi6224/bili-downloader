import type { Messages } from '../types'

export default {
  modelMissing: '{text}; puoi anche aspettare che venga scaricato automaticamente alla prima rimozione della filigrana',
  cancel: 'Annulla',
  retry: 'Riprova',
  downloadModel: 'Scarica modello',
  codecAvcHint: 'Massima compatibilità',
  codecHevcHint: 'File più piccoli',
  outputFull: 'Video completo',
  outputFullHint: 'Video e audio in un unico file',
  outputAudio: 'Solo audio',
  outputAudioHint: 'Salva solo l’audio (m4a, flac se lossless)',
  outputVideo: 'Solo video',
  outputVideoHint: 'Salva solo le immagini, senza audio',
  raisePriority: 'Aumenta priorità',
  codecFallback: 'Questa qualità non è disponibile in {wanted}, verrà scaricato {actual}',
  content: 'Contenuto',
  noAudioTrack: 'Questo video non ha una traccia audio separata',
  codecOrder: 'Priorità dei codec',
  audio: 'Qualità audio',
  audioUnavailable: ' (non disponibile per questo video)',
  audioHint:
    '“Migliore”: per il video completo privilegia Dolby (lossless in MKV), per il solo audio privilegia lossless; se il livello scelto non è disponibile si scende automaticamente',
  container: 'Contenitore',
  mp4Hint: 'Si riproduce direttamente in QuickTime e su iPhone',
  mkvHint: 'Supporta tracce audio lossless e gestisce meglio sottotitoli e Dolby Vision',
  watermark: 'Filigrana',
  watermarkAutoHint:
    'Interviene solo se rileva una filigrana; richiede la ricodifica del video ed è molto più lento di un download diretto. Se riesce, viene conservata solo la versione senza filigrana. I video HDR e Dolby Vision non vengono elaborati.',
  watermarkAiHint:
    'Interviene solo se rileva una filigrana: un modello AI ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana, con un risultato molto più nitido della rimozione rapida ma molto più lento: con una scheda grafica circa 2–4 volte la durata del video, senza ancora di più. Se il modello non si scarica o la rifinitura non riesce, per questa volta si usa la rimozione rapida. I video HDR e Dolby Vision non vengono elaborati.',
  extras: 'Contenuti aggiuntivi',
  embedCover: 'Copertina nel file',
  cover: 'Copertina come immagine separata',
  embedSubtitle: 'Sottotitoli nel video',
  subtitle: 'Sottotitoli in .srt separato',
  chapters: 'Capitoli (segmenti della barra di avanzamento)',
  nfo: 'Metadati NFO',
  danmaku: 'Danmaku',
  danmakuAss: 'ASS (sovrapposti nel player)',
  danmakuXml: 'XML (originale)',
  nfoHint: 'Genera file .nfo riconosciuti da Kodi / Jellyfin / Emby; per gli anime genera anche tvshow.nfo e il poster'
} satisfies Messages['options']
