import type { Messages } from '../types'

export default {
  methodFast: 'Rapida',
  methodFastHint: 'Riempie con l’immagine circostante; termina in pochi minuti, ma la zona della filigrana risulta un po’ sfocata',
  methodAi: 'Rifinitura AI',
  methodAiHint: 'Un modello AI ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana: molto più nitido, ma lento',
  title: 'Rimuovi filigrana',
  subtitle:
    'Trascina il riquadro sopra la filigrana; trascina gli angoli e i lati per ridimensionarlo. Il video viene ricodificato e, al termine, sostituisce il file originale.',
  alreadyApplied:
    'La filigrana di questo video è già stata rimossa una volta: elaborarlo di nuovo comporta un’altra ricodifica, con una leggera perdita di qualità.',
  detected: 'Filigrana rilevata nell’angolo {corner}; puoi ancora regolare il riquadro.',
  notDetected: 'Nessuna filigrana rilevata automaticamente: trascina il riquadro sopra la filigrana.',
  frameAlt: 'Fotogramma del video',
  regionLabel: 'Area della filigrana: spostala con i tasti freccia, tieni premuto Shift per spostarla di 10 pixel alla volta',
  detecting: 'Rilevamento filigrana…',
  nextFrame: 'Altro fotogramma',
  showOriginal: 'Mostra originale',
  preview: 'Anteprima',
  reset: 'Ripristina',
  cancel: 'Annulla',
  retry: 'Riprova',
  downloadModel: 'Scarica modello',
  estimating: 'Stima del tempo necessario (la prima volta carica il modello e prova alcuni fotogrammi: circa una decina di secondi)…',
  startAi: 'Avvia rifinitura AI',
  start: 'Avvia'
} satisfies Messages['wmDialog']
