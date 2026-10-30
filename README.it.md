<div align="center">

<img src="build/icon.png" width="128" alt="Icona di Bili Downloader">

# Bili Downloader

Un'app desktop per Windows, macOS e Linux che scarica da bilibili: incolla un link per ottenere video, video in più parti, raccolte, anime e film.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
![macOS 12+](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)
![Apple Silicon | Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-blue)
![Windows x64](https://img.shields.io/badge/Windows-x64-black?logo=windows)
![Linux x64](https://img.shields.io/badge/Linux-x64-black?logo=linux)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | **Italiano** | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="Coda dei download">
  <img src="docs/screenshots/select.png" width="49%" alt="Scelta di episodi, qualità e contenuti extra">
</p>

> [!NOTE]
> Questo è un progetto non ufficiale, non affiliato né approvato da bilibili. Scarica solo contenuti che il tuo account è autorizzato a guardare, per uso personale, nel rispetto dei diritti dei creatori e dei termini di servizio di bilibili.

## Funzionalità

### Link supportati

- Video (BV / av), video in più parti, raccolte, anime e film (ep / ss / md), corsi a pagamento
- Cartelle dei preferiti, «Guarda più tardi», video, raccolte e serie di un autore (UP 主), con filtro per parola chiave
- Tracce e playlist audio (au / am), «每周必看» (i consigliati della settimana) e classifiche per categoria
- Link brevi (b23.tv e altri) e testi di condivisione che contengono anche il titolo
- Analisi di più link alla volta; caricamento pagina per pagina degli elenchi paginati (preferiti, pagine degli autori)

### Qualità e formati

- L'elenco delle qualità arriva dall'API (8K / Dolby Vision / HDR / 4K / 1080P60 / …), con i livelli riservati agli abbonati premium (大会员) evidenziati
- Priorità dei codec AVC / HEVC / AV1; audio fino a Dolby Atmos e FLAC lossless Hi-Res
- Video completo, solo audio o solo video; MP4 o MKV
- ffmpeg copia i flussi direttamente nel file finale, senza ricodifica

### Contenuti extra

- Copertina: salvata come immagine e/o incorporata nel file
- Sottotitoli CC: salvati come `.srt` e/o incorporati nel video
- Danmaku (commenti a scorrimento) in `.ass` e/o `.xml`, con dimensione del carattere, opacità e durata regolabili
- I segmenti della barra di avanzamento di bilibili, scritti come veri capitoli
- Metadati NFO per le librerie multimediali Kodi / Jellyfin

### Coda e rete

- Download simultanei, download multithread a segmenti, limite di velocità e nuovi tentativi automatici in caso di errori di rete, tutti regolabili
- Pausa, ripresa e ripresa anche dopo un riavvio; le attività non scaricabili mostrano chiaramente il motivo
- Proxy: diretto, di sistema o manuale; test di latenza integrato per scegliere il nodo CDN bilibili più veloce
- Possibilità di impedire la sospensione del computer (o dello schermo) durante i download e notifica a coda completata

### Organizzazione e automazione

- Modelli di denominazione con variabili (`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}`, …), segmenti opzionali e livelli di cartelle, impostabili separatamente per video singoli, raccolte e anime
- Riconosce i contenuti già scaricati e chiede / salta / scarica di nuovo
- Abbonamenti: controlla periodicamente preferiti, raccolte o autori e scarica automaticamente le novità
- Cronologia delle analisi, monitoraggio degli appunti, tema chiaro / scuro, esecuzione in background, importazione / esportazione delle impostazioni
- Aggiornamenti integrati da GitHub Releases, con note di rilascio e possibilità di saltare una versione

### Integrazione con l'IA

- Un server [MCP](https://modelcontextprotocol.io) locale permette a client IA come Claude di analizzare link, mettere in coda download e controllarne l'avanzamento (vedi **Server MCP** più avanti)

## Installazione

### macOS

1. Scarica l'ultimo `.dmg` dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest):
   - Apple Silicon (M1 e successivi): `bili-downloader-<version>-arm64.dmg`
   - Intel: `bili-downloader-<version>-x64.dmg`
2. Apri il dmg e trascina **B站下载器** in **Applicazioni**.
3. L'app ha una firma ad hoc ma non è autenticata da Apple, quindi macOS la blocca al primo avvio. Prova ad aprirla una volta, poi vai in **Impostazioni di Sistema → Privacy e sicurezza** e fai clic su **Apri comunque**. (Da macOS 15 clic destro → Apri non funziona più.) In alternativa, esegui:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

Richiede macOS 12 o successivo.

### Windows

Scarica `bili-downloader-<version>-x64.exe` dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) ed esegui il programma di installazione. Si installa per l'utente corrente e non richiede privilegi di amministratore. Il programma di installazione non è firmato, quindi Windows potrebbe mostrare un avviso di editore sconosciuto.

### Linux

Scarica uno di questi file dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) (solo x86 a 64 bit):

- **AppImage** (qualsiasi distribuzione, si aggiorna da sola): `bili-downloader-<version>-x86_64.AppImage`. Rendila eseguibile e avviala:

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  Le AppImage richiedono FUSE 2. Se non si avvia, installalo (`sudo apt install libfuse2t64` su Ubuntu 24.04 e successivi, `libfuse2` sulle versioni precedenti) oppure avviala con `--appimage-extract-and-run`.
- **deb** (Debian, Ubuntu e derivate): `bili-downloader-<version>-amd64.deb`. Installalo con `sudo apt install ./bili-downloader-<version>-amd64.deb`; **B站下载器** comparirà poi nel menu delle applicazioni.

Quando chiudi la finestra e l'app resta in background, fai clic sulla sua icona nell'area di notifica per riaprirla. Su GNOME serve l'estensione AppIndicator (Ubuntu la include di serie). La barra dei menu è nascosta; premi <kbd>Alt</kbd> per mostrarla.

### Aggiornamenti

Una volta installata, l'app controlla da sola gli aggiornamenti. L'app per macOS, il programma di installazione per Windows e l'AppImage per Linux li installano direttamente; la versione deb mostra le note di rilascio e ti rimanda alla pagina di download.

Al momento l'interfaccia è disponibile solo in cinese semplificato; le voci citate qui sotto sono riportate in cinese con la traduzione.

## Guida rapida

1. Accedi al tuo account bilibili (vedi **Accesso** più avanti). L'app ha bisogno di un account per analizzare i link.
2. Copia un link di bilibili. L'app lo rileva dagli appunti quando torni alla sua finestra; in alternativa premi <kbd>⌘</kbd><kbd>V</kbd> (<kbd>Ctrl</kbd><kbd>V</kbd> su Windows e Linux) nel campo di inserimento e fai clic su **解析** (Analizza).
3. Scegli gli elementi da scaricare: seleziona tutto, inverti la selezione, <kbd>Maiusc</kbd>-clic per un intervallo, oppure filtra per titolo o per numero (ad es. `1-5,7`).
4. Scegli qualità, tipo di output e contenuti extra, poi fai clic su **下载** (Scarica).

Al posto di un link puoi anche scrivere queste parole chiave: `稍后再看` o `watchlater` (Guarda più tardi), `每周必看` (consigliati della settimana), `排行榜` (classifiche).

## Accesso

Con l'accesso ottieni le qualità e i contenuti a cui il tuo account ha diritto (1080P e oltre, contenuti premium). Ci sono tre modi:

- **从浏览器导入** (Importa dal browser): riutilizza i cookie di accesso di Chrome, Edge, Brave, Arc (solo macOS), Vivaldi, Chromium o Firefox.
  - macOS protegge i dati di Chrome, Edge e Brave: abilita prima l'app in **Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco** e riavviala. L'importazione dai browser basati su Chromium chiede anche l'accesso al Portachiavi.
  - Su Linux i browser basati su Chromium conservano la chiave dei cookie nel portachiavi di sistema (GNOME Keyring / libsecret). L'app la legge con `secret-tool` (`sudo apt install libsecret-tools`) e il portachiavi potrebbe chiederti di sbloccarlo. Sono supportati anche Firefox installato tramite Snap o Flatpak e Chromium in versione Snap.
  - Su Windows i browser basati su Chromium bloccano il database dei cookie mentre sono in esecuzione, quindi chiudi completamente il browser (compresi eventuali processi in background) prima di importare. I cookie scritti da Chrome 127 o successivo usano la crittografia legata all'app e non possono essere importati; se il cookie di accesso è tra questi, usa invece l'accesso nell'app oppure incolla una stringa di cookie.
- **在应用内登录** (Accedi nell'app): apre la pagina di accesso ufficiale di bilibili, con accesso tramite codice QR, password o SMS.
- **手动粘贴 Cookie** (Incolla i cookie): una stringa di cookie separati da punto e virgola, oppure il JSON esportato da un'estensione del browser.

L'app controlla lo stato di accesso all'avvio, quando torni alla finestra, durante l'analisi e ogni volta che l'API segnala una sessione scaduta. Se l'accesso è scaduto, ti chiede di accedere di nuovo, sospende il recupero dei flussi e riprende automaticamente la coda una volta rientrato. La disconnessione cancella solo i cookie dell'app, senza disconnetterti dal browser.

## Server MCP

L'app può avviare un server [Model Context Protocol](https://modelcontextprotocol.io) locale, così che i client IA possano gestire la coda dei download.

1. Vai in **设置 → 网络与高级 → MCP 服务** (Impostazioni → Rete e avanzate → Server MCP) e attivalo.
2. Usa i pulsanti della stessa sezione per copiare la configurazione del client (JSON) o il comando di Claude Code, che contengono già il tuo token di accesso.

```json
{
  "mcpServers": {
    "bili-downloader": {
      "type": "http",
      "url": "http://127.0.0.1:39231/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

```bash
claude mcp add --transport http bili-downloader http://127.0.0.1:39231/mcp --header "Authorization: Bearer <your-token>"
```

| Strumento | Descrizione |
| --- | --- |
| `get_status` | Stato di accesso e dell'abbonamento premium (大会员), riepilogo della coda, spazio libero nella cartella di download e cose a cui fare attenzione. Da chiamare per primo |
| `parse_link` | Analizza un link bilibili (video, raccolta, anime, corso, preferiti, autore…); gli elenchi vengono sfogliati automaticamente. Gli id degli elementi sono stabili; i risultati si leggono a blocchi e i video in più parti si possono espandere |
| `download_batch` | Aggiunge un intero link o gli elementi scelti come un unico lotto e restituisce un `batch_id`. Per impostazione predefinita salta gli elementi già scaricati, e reinviare la stessa richiesta non scarica nulla due volte |
| `get_batch_status` | Avanzamento del lotto: attività per stato, velocità, tempo rimanente stimato, qualità effettiva, motivi degli errori. `wait_seconds` attende i cambiamenti |
| `list_batches` | Lotti inviati di recente |
| `list_tasks` | Elenca le attività a pagine, filtrate per lotto, stato o titolo |
| `control_tasks` | Mette in pausa, riprende, ritenta, riscarica o rimuove attività in blocco (i file scaricati non vengono mai eliminati) |
| `get_settings` / `update_settings` | Legge o modifica cartella di download, download simultanei, thread, limite di velocità, tentativi automatici, qualità e opzioni predefinite |

Il server ascolta solo su `127.0.0.1` (la porta è configurabile), richiede il token Bearer e controlla le intestazioni `Host` / `Origin` per prevenire il DNS rebinding. Puoi rigenerare il token in qualsiasi momento.

## Limitazioni

- Non è possibile scaricare contenuti protetti da DRM, con restrizioni geografiche o che il tuo account non è autorizzato a guardare. Queste attività vengono contrassegnate come **无法下载** (impossibile scaricare) con il motivo.
- Sono supportati Windows x64, macOS x64 / arm64 e Linux x64. Non sono disponibili versioni ARM per Windows e Linux.

## Compilare dai sorgenti

Servono Windows, macOS o Linux, Node.js 22.12 o successivo e npm.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # modalità sviluppo
npm test             # test unitari
npm run typecheck    # controllo dei tipi
npm run build:mac    # su macOS: genera i dmg / zip x64 e arm64 in dist/
npm run build:linux  # su Linux: genera l'AppImage / il deb x64 in dist/
npm run build:win    # su Windows: genera il programma di installazione NSIS x64 in dist/
```

Vedi [CONTRIBUTING.md](CONTRIBUTING.md) (in inglese) per il flusso di sviluppo e [docs/RELEASING.md](docs/RELEASING.md) (in cinese) per pacchettizzazione e rilasci.

## Struttura del progetto

```
src/main/auth               Accesso: archiviazione dei cookie, finestra di accesso, importazione dal browser, rilevamento della scadenza
src/main/bili               API bilibili: firma WBI, analisi di video / anime / corsi / elenchi, flussi, sottotitoli, danmaku
src/main/download           Coda dei download, ripresa, multiplexing con ffmpeg, contenuti extra (copertina, sottotitoli, NFO…)
src/main/net                Proxy e scelta del CDN
src/main/update             Aggiornamenti integrati: controllo di update.json, verifica dei download, installazione degli aggiornamenti .app / AppImage / NSIS
src/main/mcp                Server MCP locale
src/main/subscriptions.ts   Abbonamenti
src/shared                  Tipi, analisi dei link e modelli di denominazione condivisi tra i processi
src/renderer                Interfaccia (React + Tailwind CSS + zustand)
scripts                     Download di ffmpeg, generazione delle icone, pubblicazione dei rilasci
```

## Contribuire

Issue e pull request sono benvenute. Leggi prima [CONTRIBUTING.md](CONTRIBUTING.md).

## Ringraziamenti

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) per la documentazione delle API di bilibili
- [FFmpeg](https://ffmpeg.org) e [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## Licenza

[MIT](LICENSE) © wangzi6224

L'app include binari FFmpeg statici provenienti da [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (`b6.1.1`). FFmpeg viene eseguito come programma separato con la propria licenza e non è coperto dalla licenza MIT indicata sopra. Il testo della sua licenza è incluso nell'app in `Contents/Resources/ffmpeg/LICENSE` (macOS) / `resources/ffmpeg/LICENSE` (Windows e Linux); vedi anche [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html).
