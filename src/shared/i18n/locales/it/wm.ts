import type { Messages } from '../types'

export default {
  // shared/watermark.ts: in quale angolo dell’immagine si trova la filigrana
  cornerTopLeft: 'in alto a sinistra',
  cornerTopRight: 'in alto a destra',
  cornerBottomLeft: 'in basso a sinistra',
  cornerBottomRight: 'in basso a destra',

  // Note sulle attività (salvate in tasks.json)
  noteNone:
    'Rimozione filigrana: nessuna filigrana rilevata, il video originale è stato mantenuto (puoi selezionarla manualmente con “Rimuovi filigrana…” sull’attività)',
  noteStatic:
    'Rimozione filigrana: l’immagine cambia troppo poco per il rilevamento automatico, il video originale è stato mantenuto (puoi selezionarla manualmente con “Rimuovi filigrana…” sull’attività)',
  noteFewFrames:
    'Rimozione filigrana: il video è troppo breve o troppo scuro per il rilevamento automatico, il video originale è stato mantenuto (puoi selezionarla manualmente con “Rimuovi filigrana…” sull’attività)',
  noteHdr: 'Rimozione filigrana: i video HDR e Dolby Vision non sono ancora supportati, il video originale è stato mantenuto',
  noteInterrupted: 'Rimozione filigrana non completata (l’app è stata chiusa durante l’elaborazione), il video originale è stato mantenuto',
  noteMoved: 'Rimozione filigrana non completata: il video originale è stato spostato o eliminato durante l’elaborazione',
  noteFailed: 'Rimozione filigrana non riuscita: {reason}; il video originale è stato mantenuto',
  /** reason è già una spiegazione completa, ad esempio “Rimozione filigrana non riuscita: …” o “Timeout della rimozione filigrana: …” */
  noteFailedWhole: '{reason}; il video originale è stato mantenuto',
  noteAiFallback: 'Rimozione filigrana: impossibile scaricare il modello AI ({reason}), per questa volta è stata usata la rimozione rapida',
  noteAiFailed: 'Rimozione filigrana: la rifinitura AI non è stata completata ({reason}), per questa volta è stata usata la rimozione rapida',

  // Rilevamento ed elaborazione
  modelNotDone: 'Download non completato',
  noVideoFrame: 'Nessuna immagine video trovata',
  noVideoInFile: 'Il file non contiene immagini video',
  hdrUnsupported: 'I video HDR e Dolby Vision non sono ancora supportati',
  regionTooSmall: 'Area della filigrana troppo piccola',
  taskMissing: 'L’attività non esiste',
  notDone: 'Si possono elaborare solo i video già scaricati completamente',
  audioOnly: 'Questa attività contiene solo audio, senza immagini',
  fileMissing: 'File video non trovato: potrebbe essere stato spostato o eliminato',
  grabFailed: 'Impossibile estrarre un fotogramma dal video',
  previewFailed: 'Impossibile generare l’anteprima',
  probeFailed: 'Impossibile leggere le informazioni del video',
  probeFailedNoFile: 'Impossibile leggere le informazioni del video: il file non esiste',
  ffNoResponse: 'ffmpeg non risponde',
  ffTooMuchOutput: 'ffmpeg ha prodotto più dati del previsto',
  ffStalled: 'Timeout della rimozione filigrana: ffmpeg non avanza da molto tempo',
  stalled: 'Timeout della rimozione filigrana: nessun avanzamento da molto tempo',
  encoderExited: 'Il processo di codifica è terminato',

  // Rifinitura AI
  backendCoreml: 'Apple Neural Engine',
  /** Nome del processo di inferenza nel gestore attività del sistema */
  hostServiceName: 'Rimozione filigrana AI',
  badInference: 'Risultato dell’inferenza anomalo',
  noAiBackend: 'Nessun metodo di inferenza AI disponibile ({errors})',
  modelNotLoaded: 'Modello non ancora caricato',
  modelNoImage: 'Il modello non ha prodotto un’immagine',
  hostExited: 'Il processo di inferenza è terminato inaspettatamente (codice {code})',
  exitCodeUnknown: 'sconosciuto',
  loadTimeout: 'Timeout nel caricamento del modello',
  inferTimeout: 'Timeout dell’inferenza',
  modelUnreachable:
    'Impossibile raggiungere gli indirizzi di download del modello ({names}): controlla la rete o configura un proxy nelle impostazioni',
  modelChecksum: 'Il file del modello scaricato non ha superato la verifica, riprova',
  modelMissing: 'Il modello AI non è ancora stato scaricato',
  modelIncomplete: 'File del modello incompleto',
  modelBadFormat: 'Formato del file del modello non valido',
  modelBadSize: 'Dimensioni del modello non valide',
  modelNoGraph: 'Il file del modello non contiene un grafo di calcolo',
  modelInputNotImage: 'L’input del modello non è un’immagine',
  maskSize: 'Dimensioni della maschera errate',
  outputSize: 'Dimensioni dell’output del modello errate'
} satisfies Messages['wm']
