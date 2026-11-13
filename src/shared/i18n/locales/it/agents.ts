export default {
  group: 'Assistenti AI',
  groupHint: 'Aggiungi Bili Downloader agli assistenti AI che usi. Una volta installato, di’ “scarica questo video Bilibili” o “cerca … su Bilibili” in qualsiasi conversazione e useranno Bili Downloader. Gli aggiornamenti seguono automaticamente quelli dell’app.',
  installAll: 'Configurazione con un clic',
  installAllButton: 'Installa tutti ({count})',
  installedAll: 'Installato per {count} assistenti AI. Riavviali per applicare',
  install: 'Installa',
  update: 'Aggiorna',
  uninstall: 'Rimuovi',
  installed: 'Installato in {name}',
  installedRestart: 'Installato in {name}. Riavvia {name} per applicare',
  installedTrust: 'Installato in {name}. Fai clic su “Considera attendibile” nel pannello MCP di {name} per attivarlo',
  trustHint: 'Fai clic su “Considera attendibile” nel pannello MCP di {name} per attivarlo',
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
  skillTroubleshoot: 'Quando gli strumenti non funzionano',
  skillTroubleshootBody:
    '- L’errore dice che l’app non è in esecuzione: gli strumenti aprono {appName} in background automaticamente; attendi qualche secondo e riprova. Se non funziona ancora, chiedi all’utente di aprire {appName}.\n' +
    '- L’errore dice che il servizio MCP è disattivato: chiedi all’utente di attivare “Attiva servizio MCP” in {appName} > Impostazioni > Assistenti AI.\n' +
    '- Non ci sono strumenti bili-downloader: chiedi all’utente di fare clic su “Installa” per l’assistente AI in uso in {appName} > Impostazioni > Assistenti AI, poi di riavviarlo.'
}
