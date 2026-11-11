import type { Messages } from '../types'

export default {
  // Intervalli di tempo: {count} è un valore singolo, {lo}–{hi} un intervallo
  secOne: { one: 'circa {count} secondo', other: 'circa {count} secondi' },
  secRange: 'circa {lo}–{hi} secondi',
  minOne: { one: 'circa {count} minuto', other: 'circa {count} minuti' },
  minRange: 'circa {lo}–{hi} minuti',
  hourOne: { one: 'circa {count} ora', other: 'circa {count} ore' },
  hourRange: 'circa {lo}–{hi} ore',
  // Quante volte la durata del video
  ratioOne: { one: 'circa {count} volta', other: 'circa {count} volte' },
  ratioRange: 'circa {lo}–{hi} volte',

  basisMeasured: 'in base alla velocità effettiva di elaborazione su questo computer',
  basisCalibrated: 'in base alla velocità di una prova',
  basisDefault: 'nessuna elaborazione ancora fatta su questo computer: è una stima approssimativa',

  modelNote: 'al primo utilizzo bisogna scaricare un modello AI di circa {size} MB',
  fastChoice: 'rimozione rapida, {time} (riempie con l’immagine circostante, la zona della filigrana resta un po’ sfocata)',
  fastChoiceNoTime: 'rimozione rapida (riempie con l’immagine circostante, la zona della filigrana resta un po’ sfocata)',
  aiChoice: 'rifinitura AI, {time} (ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana, molto più nitida{model})',
  aiChoiceNoTime: 'rifinitura AI (ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana, molto più nitida{model})',
  /** Va dentro le parentesi di aiChoice; non compare se {model} è vuoto */
  aiChoiceModel: '; {note}',
  choices: '{fast}, {ai}',

  processing: 'Rimozione della filigrana in corso: puoi attendere con wait_seconds; al termine watermark.removed dell’attività sarà true',
  pending: {
    one:
      '{count} video scaricato ha la filigrana di Bilibili: chiedi prima all’utente se vuole rimuoverla; le opzioni sono: {choices}. ' +
      'La rimozione ricodifica e sostituisce il file originale; dopo il consenso dell’utente chiama remove_watermark batch_id={id} method=fast oppure method=ai',
    other:
      '{count} video scaricati hanno la filigrana di Bilibili: chiedi prima all’utente se vuole rimuoverla; le opzioni sono: {choices}. ' +
      'La rimozione ricodifica e sostituisce il file originale; dopo il consenso dell’utente chiama remove_watermark batch_id={id} method=fast oppure method=ai'
  },
  willDetect: 'Durante il download verrà rilevato se ogni video ha la filigrana di Bilibili; il risultato comparirà qui',
  plannedOff:
    'Durante il download verrà rilevato se c’è la filigrana di Bilibili: controlla con get_batch_status; se c’è, puoi chiedere all’utente se vuole rimuoverla con remove_watermark',
  plannedOn: 'Dai video in cui viene rilevata la filigrana di Bilibili la filigrana verrà rimossa dopo il download, con ricodifica',
  plannedKnown: 'Rimozione filigrana per i video di durata nota: in totale {time} ({basis})',
  plannedAll: 'Rimozione filigrana per tutti i video: in totale {time} ({basis})',
  plannedModel: '{model}; se non si riesce a scaricarlo si usa la rimozione rapida',
  speed: '{ratio} ({basis})',
  speedBackend: '{ratio} ({basis}, {backend})',

  regionInvalid: 'region deve essere {x, y, w, h}, in pixel del video',
  regionOneTask: 'region si può usare solo con una singola attività: posizione e dimensioni della filigrana possono variare tra video diversi',
  tooManyTasks: 'Al massimo {max} attività per volta',
  busy: 'Elaborazione in corso, attendi che termini',
  tooManyInspect: 'Troppi video da rilevare in questa chiamata (al massimo {max} per volta): chiama di nuovo per i restanti',
  alreadyRemoved:
    'La filigrana è già stata rimossa; per rielaborare con un altro metodo (ad esempio passare dalla rimozione rapida alla rifinitura AI) passa force=true',
  regionOutside: 'region è fuori dall’immagine o troppo piccola (dimensioni del video {size})',
  unsure: 'Non è certo che ci sia la filigrana di Bilibili; se confermi che c’è, indica la posizione con region (puoi usare suggested_region)',
  noRegion: 'Posizione della filigrana non riconosciuta; se confermi che c’è una filigrana, indica la posizione con region (coordinate in pixel)',
  total: 'In totale {time} ({basis})',
  aiFallback:
    '{model}; se non si riesce a scaricarlo o la rifinitura non riesce, per questa volta si usa la rimozione rapida e il campo note dell’attività lo indicherà',
  dryRun: 'Questa è una stima, l’elaborazione non è iniziata; dopo il consenso dell’utente chiama di nuovo senza dry_run',
  started:
    'Durante l’elaborazione il video originale resta invariato e viene sostituito al termine; controlla watermark.processing con get_batch_status o list_tasks; puoi annullare con control_tasks action=cancel_watermark',
  noneSkipped: 'Nessun video elaborabile: i motivi sono in skipped',
  noneEligible:
    'Nessun video da elaborare: con batch_id vengono elaborati solo i video scaricati completamente, con filigrana rilevata e non ancora rimossa; per gli altri indicali con task_ids',
  targetsMissing: 'Indica i video da elaborare con task_ids o batch_id'
} satisfies Messages['mcpWm']
