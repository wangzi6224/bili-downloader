import type { Messages } from '../types'

export default {
  qn: 'Codice di qualità; viene scelto il livello disponibile più alto non superiore a questo: 127 massima disponibile, 120 4K, 116 1080P60, 112 1080P+, 80 1080P, 64 720P, 32 480P, 16 360P',

  // Opzioni di download (campi di options / defaults)
  optOutput: 'Video completo / solo audio / solo video (senza audio)',
  optContainer: 'Formato contenitore del video',
  optAudio: 'Qualità audio: best sceglie automaticamente la migliore; se il livello indicato non è disponibile si scende di livello',
  optCodecOrder: 'Priorità dei codec video, ad esempio ["hevc","avc","av1"]',
  optSubtitle: 'Salva i sottotitoli come .srt separato',
  optEmbedSubtitle: 'Incorpora i sottotitoli nel file video',
  optDanmaku: 'Scarica i danmaku',
  optDanmakuFormat: 'Formato dei danmaku',
  optCover: 'Salva la copertina come immagine separata',
  optEmbedCover: 'Incorpora la copertina nel file video / audio',
  optChapters: 'Scrivi i segmenti della barra di avanzamento come capitoli',
  optNfo: 'Genera metadati NFO per Kodi / Jellyfin',
  optWatermark:
    'Rimozione filigrana: dopo il download rileva automaticamente la filigrana in un angolo dell’immagine e la rimuove (richiede la ricodifica del video; se non viene rilevata, o per HDR e Dolby Vision, il video originale viene mantenuto). ' +
    'auto rimozione rapida (riempimento per interpolazione, termina in pochi minuti, la zona della filigrana resta un po’ sfocata); ai ricostruisce fotogramma per fotogramma con un modello AI, molto più nitido ma molto più lento ' +
    '(con una scheda grafica circa 2–4 volte la durata del video, senza ancora di più; al primo utilizzo scarica un modello di circa 200MB e, se non si riesce a scaricarlo, usa la rimozione rapida). ' +
    'Anche con off viene rilevato se c’è la filigrana: il risultato è in watermark di get_batch_status e in seguito si può rimuovere con remove_watermark. Se l’utente non ha parlato di rimuovere la filigrana, non serve passarlo',

  getStatusTitle: 'Stato dell’app',
  getStatusDesc:
    'Stato di accesso e di Bilibili Premium, riepilogo della coda di download, velocità totale, cartella di download e spazio libero, impostazioni principali e avvisi a cui prestare attenzione. Consigliato come prima chiamata.',

  parseLinkTitle: 'Analizza link',
  parseLinkDesc:
    'Analizza un link di Bilibili (video, raccolta, anime, corso, cartella dei preferiti, pagina di un creator, Guarda più tardi ecc.); gli elenchi paginati vengono sfogliati automaticamente. ' +
    'Con molti elementi leggili a blocchi con offset / limit; il risultato resta in cache per 10 minuti. Gli id degli elementi sono stabili e vanno passati in ids di download_batch. ' +
    'I video degli elenchi (lazy) non hanno ancora le parti espanse: vengono espanse automaticamente quando si aggiungono al download; per vedere le parti o scaricarne solo alcune passa expand_parts. ' +
    "downloaded='partly' di un video lazy indica che almeno una parte è già stata scaricata; quando viene aggiunto al download ogni parte viene verificata singolarmente.",
  parseLinkUrl: 'Link di Bilibili, codice BV, oppure la parola chiave “稍后再看” (Guarda più tardi), “每周必看” (Da non perdere della settimana) o “排行榜” (Classifiche), da passare in cinese così com’è',
  parseLinkMaxItems: 'Numero massimo di elementi da recuperare sfogliando le pagine, predefinito {n}',
  parseLinkOffset: 'Posizione dell’elemento da cui iniziare a restituire, predefinito 0',
  parseLinkLimit: 'Numero di elementi da restituire, predefinito 100',
  parseLinkExpand: 'Espandi le parti dei video degli elenchi restituiti in questa chiamata (una richiesta per video, più lento); in questo caso limit è al massimo {n}',
  parseLinkRefresh: 'Ignora la cache e analizza di nuovo',

  downloadTitle: 'Download in blocco',
  downloadDesc:
    'Scarica video, raccolte, anime, cartelle dei preferiti e altro da Bilibili. Aggiunge gli elementi del link alla coda di download come un unico batch e restituisce subito batch_id; le parti dei video degli elenchi vengono espanse in background. ' +
    'Scegli gli elementi con ids, oppure all=true per scaricarli tutti; per il link di un singolo video puoi ometterli entrambi. ' +
    'Se i video da scaricare provengono da link diversi (ad esempio risultati di ricerca), inviali tutti insieme con videos invece di chiamarlo per ciascuno. Gli elementi già scaricati vengono saltati per impostazione predefinita e quelli già in coda non vengono aggiunti di nuovo. ' +
    'Se il batch originale non è ancora terminato, reinviare la stessa richiesta restituisce il batch originale (deduplicated=true); con request_id puoi indicare esplicitamente la chiave di idempotenza.',
  downloadUrl: 'Lo stesso link usato con parse_link. Non si può usare insieme a videos',
  downloadVideos:
    'Codici BV, codici av, link di video o link brevi b23.tv (ad esempio gli url nei risultati di search_videos), riuniti in un unico batch: al massimo {max}, di cui al massimo 20 link brevi e codici av. Di ogni video vengono scaricate tutte le parti e il parametro p del link non ha effetto; per i link di elenchi come raccolte e cartelle dei preferiti usa url',
  downloadBatchTitle:
    'Nome del batch per videos; con più video è anche il nome della cartella di salvataggio. Predefinito: per un video il suo titolo, per più video “N video”',
  downloadIds: 'id degli elementi restituiti da parse_link (l’id di un video indica tutte le sue parti)',
  downloadAll: 'Scarica tutti gli elementi (al massimo max_items)',
  downloadMaxItems:
    'Con all=true, numero massimo di elementi da recuperare, predefinito {n}; se coincide con quello di parse_link ne usa direttamente la cache',
  downloadQn: '{qn}. Predefinito: la qualità delle impostazioni',
  downloadOptions: 'Opzioni di download; quelle non passate usano i valori predefiniti delle impostazioni',
  downloadSubdir: 'Salva in questa sottocartella della cartella di download',
  downloadSkip: 'Salta gli elementi già presenti nella cronologia download, predefinito true',
  downloadRequestId: 'Chiave di idempotenza: lo stesso request_id crea un solo batch',

  batchStatusTitle: 'Avanzamento del batch',
  batchStatusDesc:
    'Mostra l’avanzamento di un batch: numero di attività per stato, byte scaricati, velocità, tempo residuo stimato, qualità effettiva, motivi degli errori e suggerimenti sul passo successivo. ' +
    'watermark descrive la rimozione della filigrana: numero di video con filigrana di Bilibili rilevata, quanti ne sono già stati ripuliti, avanzamento dell’elaborazione in corso e, se ci sono filigrane non ancora rimosse, quanto tempo richiede ciascuno dei due metodi (hint contiene la formulazione da riferire all’utente). ' +
    'Con wait_seconds maggiore di 0 attende finché il batch è del tutto terminato, in pausa o richiede un intervento (al massimo per quel tempo), e attende anche mentre la rimozione della filigrana è in corso: più comodo di interrogazioni ripetute.',
  batchStatusWait: 'Numero massimo di secondi di attesa, predefinito 0',
  batchStatusInclude: 'Dettagli aggiuntivi: failed elenco degli errori (predefinito), files percorsi dei file completati, running attività in download',

  listBatchesTitle: 'Batch recenti',
  listBatchesDesc: 'Batch inviati di recente (i più nuovi per primi); utile per ritrovare un batch_id.',
  listBatchesLimit: 'Predefinito 20',

  listTasksTitle: 'Elenco attività',
  listTasksDesc:
    'Elenco paginato delle attività di download, filtrabile per batch, stato e titolo. Stati: queued in coda, running in download, paused in pausa, retrying in attesa di riprova automatica, ' +
    'failed non riuscita, unsupported non scaricabile, waiting_auth in attesa di accesso, done completata; active indica quelle non ancora terminate.',
  listTasksStatus: 'Uno o più stati, predefinito all',
  listTasksQuery: 'Testo contenuto nel titolo',
  listTasksLimit: 'Predefinito 50',
  listTasksFields: 'Restituisci solo questi campi',

  controlTitle: 'Controllo delle attività in blocco',
  controlDesc:
    'Mette in pausa, riprende, riprova, riscarica o rimuove attività in blocco, oppure annulla la rimozione della filigrana. Indica l’ambito con task_ids, batch_id, status (almeno uno, combinabili). ' +
    'Se indichi solo batch_id (senza task_ids né status) l’operazione vale per l’intero batch: con pause / resume vengono messe in pausa / riprese anche le attività aggiunte alla coda in seguito, con retry vengono ritentati anche gli elementi la cui espansione delle parti non è riuscita, con remove non vengono più aggiunti gli elementi non ancora elaborati. ' +
    'redownload elimina la parte scaricata e riscarica da capo; remove annulla le attività non completate e le toglie dall’elenco, senza eliminare i file già scaricati; ' +
    'cancel_watermark annulla la rimozione della filigrana in corso (avviata da remove_watermark) e il video originale resta invariato.',
  controlStatus: 'Agisci solo sulle attività in questi stati',
  controlUnsupported: 'Con retry riprova anche le attività “non scaricabili” (ad esempio se l’utente ha appena attivato Bilibili Premium)',

  removeWmTitle: 'Rimuovi filigrana',
  removeWmDesc:
    'Rimuove la filigrana di Bilibili dall’angolo dell’immagine dei video scaricati; lavora in background e al termine sostituisce il file originale (con ricodifica). Chiamalo solo su richiesta esplicita o con il consenso dell’utente. ' +
    'method=fast rimozione rapida: riempie con l’immagine circostante, la zona della filigrana resta un po’ sfocata, di solito richiede una frazione della durata del video; ' +
    'method=ai rifinitura AI: ricostruisce fotogramma per fotogramma l’immagine sotto la filigrana, molto più nitida ma molto più lenta (con una scheda grafica circa 2–4 volte la durata del video); al primo utilizzo scarica un modello di circa 200MB e, se non si riesce a scaricarlo o la rifinitura non riesce, usa la rimozione rapida. ' +
    'Con batch_id elabora i video di quel batch scaricati completamente, con filigrana rilevata e non ancora rimossa; con task_ids li rileva uno per uno (ogni video non rilevato durante il download richiede alcuni secondi, al massimo 10 rilevamenti per volta). ' +
    'Prima chiamalo con dry_run=true per ottenere il tempo stimato di ogni video, comunicalo all’utente e poi chiamalo davvero. Per l’avanzamento vedi watermark in get_batch_status o list_tasks; per annullare usa control_tasks action=cancel_watermark.',
  removeWmMethod: 'fast rimozione rapida; ai rifinitura AI',
  removeWmTaskIds: 'Attività da elaborare (devono essere già scaricate completamente)',
  removeWmBatchId: 'Elabora i video di questo batch con filigrana rilevata e non ancora rimossa',
  removeWmRegion:
    'Indica manualmente la posizione della filigrana (coordinate in pixel del video); utilizzabile solo con un singolo task_id. Se la posizione non viene riconosciuta, skipped riporta le dimensioni del video e le posizioni possibili',
  removeWmForce: 'Rielabora anche i video la cui filigrana è già stata rimossa (ad esempio per passare dalla rimozione rapida alla rifinitura AI)',
  removeWmDryRun: 'Rileva e stima soltanto il tempo, senza avviare l’elaborazione',

  getSettingsTitle: 'Leggi impostazioni',
  getSettingsDesc:
    'Legge le impostazioni relative al download: cartella di download, numero di download simultanei, thread per file, limite di velocità, numero di riprove automatiche, qualità predefinita e opzioni di download predefinite.',

  updateSettingsTitle: 'Modifica impostazioni',
  updateSettingsDesc:
    'Modifica le impostazioni relative al download: passa solo le voci da cambiare. Restituisce le impostazioni modificate e quando ciascuna voce ha effetto.',
  updateDownloadDir: 'Percorso assoluto (può iniziare con ~/); se non esiste viene creato',
  updateConcurrency: 'Numero di attività scaricate contemporaneamente',
  updateThreads: 'Numero di connessioni aperte contemporaneamente per scaricare ogni file a segmenti',
  updateSpeedLimit: 'Limite di velocità globale in KB/s, 0 = nessun limite',
  updateAutoRetry: 'Numero di riprove automatiche in caso di errori di rete',
  updateDefaults: 'Opzioni di download predefinite: vengono modificati solo i campi passati',

  // Risultati delle chiamate
  noSuchTool: 'Strumento inesistente: {name}',
  noSuchToolHint: 'Usa tools/list per vedere gli strumenti disponibili',
  downloadDirAbsolute: 'download_dir deve essere un percorso assoluto',
  downloadDirUnusable: 'Cartella di download non utilizzabile: {reason}',
  effectDownloadDir: 'Vale solo per le attività aggiunte in seguito; quelle già in coda continuano a salvare nella cartella originale',
  effectConcurrency:
    'Ha effetto immediato: se aumenti il valore le attività in coda partono subito, se lo riduci i download in corso non vengono interrotti',
  effectThreads:
    'Le attività in download non sono interessate; quelle che iniziano in seguito o riprendono dopo una pausa usano il nuovo numero di segmenti',
  effectNow: 'Ha effetto immediato',
  effectLater: 'Vale solo per le attività aggiunte in seguito',
  notVip:
    'Non è Bilibili Premium: le qualità riservate a Premium come 4K e 1080P alto bitrate non sono disponibili; si scende automaticamente alla più alta scaricabile',
  appNotLoggedIn: 'L’app non ha effettuato l’accesso: l’analisi dei link richiede l’accesso. {loginHint}',
  loginUnknown: 'Al momento non è possibile verificare lo stato di accesso (forse per un problema di rete)',
  waitingAuth: {
    one: '{count} attività è in attesa dell’accesso e riprenderà automaticamente dopo un nuovo accesso. {loginHint}',
    other: '{count} attività sono in attesa dell’accesso e riprenderanno automaticamente dopo un nuovo accesso. {loginHint}'
  },
  paused: {
    one: '{count} attività è in pausa (dopo il riavvio dell’app le attività non completate vengono messe in pausa automaticamente): puoi riprenderla con control_tasks action=resume',
    other:
      '{count} attività sono in pausa (dopo il riavvio dell’app le attività non completate vengono messe in pausa automaticamente): puoi riprenderle con control_tasks action=resume'
  },
  failed: {
    one: '{count} attività non è riuscita: puoi riprovare con control_tasks action=retry status=failed',
    other: '{count} attività non sono riuscite: puoi riprovare con control_tasks action=retry status=failed'
  },
  lowSpace: 'Sul disco della cartella di download restano meno di 5 GB liberi',
  pageError: {
    one: 'Errore durante lo sfogliamento delle pagine ({error}): è stato ottenuto solo {count} elemento; tra un po’ puoi riprovare con refresh=true',
    other: 'Errore durante lo sfogliamento delle pagine ({error}): sono stati ottenuti solo i primi {count} elementi; tra un po’ puoi riprovare con refresh=true'
  },
  truncated: {
    one: 'È stato preso solo {count} elemento: per averne di più aumenta max_items (al massimo {max})',
    other: 'Sono stati presi solo i primi {count} elementi: per averne di più aumenta max_items (al massimo {max})'
  },
  moreItems: 'Ci sono altri elementi non restituiti: continua a leggere con offset={next}',
  lazyItems: 'Gli elementi lazy sono video con parti non ancora espanse: vengono espansi automaticamente quando si aggiungono al download',
  dupResumed:
    'La stessa richiesta era già stata inviata: è ripresa l’elaborazione degli elementi che l’ultima volta non erano stati aggiunti alla coda',
  dupSame:
    'La stessa richiesta era già stata inviata e non è stato aggiunto nulla di nuovo; usa get_batch_status batch_id={id} per vedere l’avanzamento; per inviarla di nuovo usa un altro request_id',
  videosWith: 'videos e {key} non si possono usare insieme',
  videosEmpty: 'videos non può essere vuoto',
  videosTooMany: 'Al massimo {max} elementi in videos per volta: inviali in più blocchi',
  titleTooLong: 'title non può superare {max} caratteri',
  videosNone:
    'videos non contiene video scaricabili (ad esempio {examples}); per i link di elenchi come raccolte e cartelle dei preferiti usa url',
  videosTitle: '{count} video',
  checkProgress: 'Usa get_batch_status batch_id={id} wait_seconds=30 per vedere l’avanzamento',
  rejected: {
    one: 'Per {count} elemento non è stato trovato il video corrispondente ed è stato ignorato: vedi rejected',
    other: 'Per {count} elementi non è stato trovato il video corrispondente e sono stati ignorati: vedi rejected'
  },
  idsAndAll: 'ids e all non si possono usare insieme',
  idsNone: 'Nessuno degli ids appartiene a questo link (ad esempio {examples}): usa prima parse_link per vedere gli id degli elementi',
  pagedList: 'Questo è un elenco di {total} elementi: passa all=true per scaricarli tutti, oppure scegli gli elementi con ids',
  unknownIds: {
    one: '{count} id non appartiene a questo link ed è stato ignorato',
    other: '{count} id non appartengono a questo link e sono stati ignorati'
  },
  addPageError: {
    one: 'Errore durante lo sfogliamento delle pagine ({error}): è stato aggiunto solo {count} elemento; tra un po’ invia di nuovo la richiesta per aggiungere i successivi',
    other:
      'Errore durante lo sfogliamento delle pagine ({error}): sono stati aggiunti solo i primi {count} elementi; tra un po’ invia di nuovo la richiesta per aggiungere i successivi'
  },
  addTruncated: {
    one: 'È stato preso solo {count} elemento e i successivi non sono stati aggiunti; per averne di più aumenta max_items (al massimo {max})',
    other: 'Sono stati presi solo i primi {count} elementi e i successivi non sono stati aggiunti; per averne di più aumenta max_items (al massimo {max})'
  },
  allDownloaded: 'Gli elementi selezionati sono già stati tutti scaricati; per scaricarli di nuovo passa skip_downloaded=false',
  nothingToDownload: 'Nessun elemento da scaricare',
  controlScope: 'Indica le attività su cui agire con task_ids, batch_id o status',
  notWatermarking: 'Nessuna rimozione della filigrana in corso',
  wrongStatus: 'Le attività nello stato {status} non supportano {action}',
  taskIdsAndBatch: 'task_ids e batch_id non si possono usare insieme',
  nothingToUpdate: 'Nessuna impostazione da modificare; si possono modificare: {names}'
} satisfies Messages['mcpTools']
