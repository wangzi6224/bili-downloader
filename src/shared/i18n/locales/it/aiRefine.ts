import type { Messages } from '../types'

export default {
  lessThanMinute: 'meno di 1 minuto',
  aboutMinutes: { one: 'circa {count} minuto', other: 'circa {count} minuti' },
  aboutMinutesRange: 'circa {min}–{max} minuti',
  aboutHours: { one: 'circa {count} ora', other: 'circa {count} ore' },
  aboutHoursRange: 'circa {min}–{max} ore',
  estimate: 'Tempo stimato: {range} · con {device}',
  hintCpu: 'Su questo computer non è stato possibile usare l’accelerazione della scheda grafica: si usa solo la CPU, quindi sarà piuttosto lento.',
  hintReuse: 'Le parti statiche dell’immagine vengono riutilizzate direttamente (circa il {pct}% dei fotogrammi).',
  hintFallback:
    'I tratti della filigrana non sono stati riconosciuti: verrà ridisegnato l’intero riquadro e il risultato potrebbe non essere quello atteso.',
  modelReady: 'Modello AI pronto',
  modelVerifying: 'Verifica del modello…',
  modelDownloading: 'Download del modello AI {pct}% ({done} / {size})',
  modelDownloadingFrom: 'Download del modello AI da {source} {pct}% ({done} / {size})',
  modelFailed: 'Download del modello non riuscito: {message}',
  unknownReason: 'motivo sconosciuto',
  modelMissing: 'La rifinitura AI richiede prima il download del modello ({size}, una sola volta)',
  settingsReady:
    'Scaricato. Viene usato quando scegli “Rifinitura AI” per rimuovere la filigrana; se lo elimini, dovrai scaricarlo di nuovo per usarlo.',
  settingsReadyDisk:
    'Scaricato, occupa {disk} cache inclusa. Viene usato quando scegli “Rifinitura AI” per rimuovere la filigrana; se lo elimini, dovrai scaricarlo di nuovo per usarlo.',
  settingsNeeded: 'Necessario quando scegli “Rifinitura AI” per rimuovere la filigrana; viene scaricato al primo utilizzo ({size}).',
  settingsNeededPartial:
    'Necessario quando scegli “Rifinitura AI” per rimuovere la filigrana; viene scaricato al primo utilizzo ({size}). La parte scaricata finora occupa {disk}.',
  settingsError: '{error}. Necessario quando scegli “Rifinitura AI” per rimuovere la filigrana; viene scaricato al primo utilizzo ({size}).',
  speedRatio: { one: 'circa {count} volta la durata del video', other: 'circa {count} volte la durata del video' },
  speedRatioRange: 'circa {min}–{max} volte la durata del video',
  basisMeasured: 'misurato su questo computer',
  basisCalibrated: 'stimato da una prova',
  basisRough: 'stima approssimativa',
  modeOff: 'Nessuna elaborazione',
  modeOffHint: 'Mantiene il video originale, senza ricodifica',
  modeAuto: 'Rimozione rapida',
  modeAutoHint: 'Riempie con l’immagine circostante, la zona della filigrana resta un po’ sfocata',
  modeAi: 'Rifinitura AI',
  modeAiHint: 'Un modello AI ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana: molto più nitido',
  hintWithSpeed: '{hint}; {speed}'
} satisfies Messages['aiRefine']
