export default {
  group: 'Assistenti AI',
  groupHint: 'Aggiungi Bili Downloader agli assistenti AI che usi. Una volta installato, di’ “scarica questo video Bilibili” o “cerca … su Bilibili” in qualsiasi conversazione e useranno Bili Downloader. Gli aggiornamenti seguono automaticamente quelli dell’app.',
  installAll: 'Configurazione con un clic',
  installAllButton: 'Installa tutti ({count})',
  installedAll: 'Installato per {count} assistenti AI. Riavviali per applicare',
  install: 'Installa',
  update: 'Aggiorna',
  uninstall: 'Rimuovi',
  installAnyway: 'Installa comunque',
  forceConfirm: '{name} non è stato trovato su questo computer. Se è installato altrove puoi installarlo comunque; la configurazione verrà scritta in: {file}',
  installed: 'Installato in {name}',
  installedRestart: 'Installato in {name}. Riavvia {name} per applicare',
  installedTrust: 'Installato in {name}. Fai clic su “Considera attendibile” nel pannello MCP di {name} per attivarlo',
  trustHint: 'Fai clic su “Considera attendibile” nel pannello MCP di {name} per attivarlo',
  notDetectedHint: '{name} non rilevato su questo computer',
  uninstalled: 'Rimosso da {name}',
  withSkill: 'Servizio MCP e skill',
  mcpOnly: 'Solo servizio MCP (skill non supportate)',
  skillConflict: 'Esiste già una skill con lo stesso nome e non è stata sostituita',
  brokenHint: 'File di configurazione illeggibile, lasciato invariato: {file}',
  state_unsupported: 'Non disponibile su questo sistema',
  state_broken: 'Errore di configurazione',
  state_outdated: 'Aggiornamento disponibile',
  state_installed: 'Installato',
  state_notDetected: 'Non rilevato',
  state_available: 'Pronto da installare',
  unknown: 'Assistente AI sconosciuto: {id}',
  unsupported: '{name} non è disponibile su questo sistema',
  configBroken: 'Impossibile leggere il file di configurazione di {name}; è stato lasciato invariato per non danneggiarlo: {file}. Controlla il file, oppure copia la configurazione in “Collega un client AI” e aggiungila a mano.',

  skillIntro:
    'Quando l’utente vuole scaricare video da Bilibili, cercare su Bilibili o fornisce un link Bilibili o un ID BV, usa gli strumenti MCP di {appName} (server bili-downloader). Non scrivere uno scraper e non passare ad altri strumenti di download. ' +
    '{appName} è un’app desktop sul computer dell’utente; i file vengono salvati nella cartella di download impostata nell’app.',
  skillWorkflow: 'Procedura',
  skillSearch: 'Scelta dei video',
  skillSearchBody:
    '- Quando l’utente vuole i video “migliori / che vale la pena guardare / consigliati”: chiama prima search_videos con order=quality (restringendo se serve con duration o published_after) invece di affidarti solo alla classifica predefinita di Bilibili.\n' +
    '- Per i primi 3–5 per punteggio, leggi il riassunto IA con get_video_transcript e il giudizio dei commenti con get_video_comments (e get_video_info per tutte le statistiche), per verificare che il contenuto sia adatto e non sia clickbait. Poi di’ all’utente quali consigli, con visualizzazioni, dati di interazione e motivi.\n' +
    '- Se la parola chiave è troppo generica, restringila o filtra con duration / published_after. quality riordina solo il pool di candidati (50 per impostazione predefinita), non l’intero sito; aumenta pool se servono più candidati.\n' +
    '- Se l’utente dice più popolari / più recenti / più discussi / più danmaku / più completi / brevi e veloci, scegli l’ordinamento corrispondente in base alla descrizione del parametro order di search_videos.\n' +
    '- Se l’utente vuole solo trovare video, riporta i consigli e i motivi e poi chiedi se scaricare; se ha già chiesto di scaricare, scarica con download_batch quello con il punteggio più alto (o quelli indicati). Se la ricerca incontra il controllo di rischio di Bilibili, aspetta qualche minuto senza riprovare di continuo.',
  skillTroubleshoot: 'Quando gli strumenti non funzionano',
  skillTroubleshootBody:
    '- L’errore dice che l’app non è in esecuzione: gli strumenti aprono {appName} in background automaticamente; attendi qualche secondo e riprova. Se non funziona ancora, chiedi all’utente di aprire {appName}.\n' +
    '- L’errore dice che il servizio MCP è disattivato: chiedi all’utente di attivare “Attiva servizio MCP” in {appName} > Impostazioni > Assistenti AI.\n' +
    '- Non ci sono strumenti bili-downloader: chiedi all’utente di fare clic su “Installa” per l’assistente AI in uso in {appName} > Impostazioni > Assistenti AI, poi di riavviarlo.',
  ytSkillIntro: 'Usa {appName} (in esecuzione su questo computer) per scaricare video di YouTube, Shorts, playlist, canali e YouTube Music, e per cercare video e leggerne sottotitoli e commenti. L’app deve essere aperta, con il servizio attivato in “Impostazioni → Assistenti AI”; il componente YouTube (yt-dlp) viene scaricato automaticamente al primo utilizzo di YouTube.',
  ytSkillTroubleshootBody: '- Viene chiesto di aggiornare il componente: chiama youtube_update_engine.\n- YouTube chiede di confermare che non si tratta di un bot, oppure i video riservati agli abbonati al canale / con limiti di età non si scaricano: importa l’accesso a YouTube con youtube_start_login; il sistema potrebbe chiedere l’autorizzazione a leggere i dati del browser, chiedi all’utente di consentirla.\n- Dalla Cina continentale YouTube è raggiungibile solo tramite proxy: chiedi all’utente di configurarne uno in “Impostazioni → Rete e avanzate” dell’app (sono supportati HTTP e SOCKS).\n- YouTube limita spesso la frequenza delle richieste per i sottotitoli tradotti automaticamente: se il download non riesce, riprova più tardi o usa i sottotitoli manuali.',
  dySkillIntro: 'Usa {appName} (su questo computer) per scaricare video, post foto, raccolte e autori Douyin, cercare e leggere dettagli e commenti. L’app deve essere aperta con il servizio attivo in “Impostazioni → Assistenti IA”. Douyin non ha sottotitoli né riassunti IA.',
  dySkillTroubleshootBody: '- VERIFY_REQUIRED: chiama douyin_open_verification e lascia che l’utente completi il controllo; non ritentare di continuo.\n- RATE_LIMITED: attendi qualche minuto.\n- Serve l’accesso: douyin_start_login per scansionare il QR.\n- I lotti grandi attivano controlli; resta moderato.'
}
