<div align="center">

<img src="build/icon.png" width="128" alt="Icona di Bili Downloader">

# Bili Downloader

**I tuoi video preferiti di bilibili, salvati sul tuo disco.** Copi il link, lo incolli, premi download: video, raccolte, anime e corsi arrivano in un colpo solo, fino a 8K / Dolby Vision, con sottotitoli, danmaku e capitoli salvati insieme. Già che ci sei, togli le filigrane con l'IA, oppure lascia che un agente IA faccia il lavoro sporco. Gratis e open source per Windows, macOS e Linux.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
[![Stars](https://img.shields.io/github/stars/wangzi6224/bili-downloader?style=flat)](https://github.com/wangzi6224/bili-downloader/stargazers)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[![Download for macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/wangzi6224/bili-downloader/releases/latest)

**[Sito web](https://wangzi6224.github.io/bili-downloader/)** · **[Download](https://github.com/wangzi6224/bili-downloader/releases/latest)** · **[Inizia](#inizia-in-quattro-passi)** · **[Lascia fare all'IA (MCP)](#fai-scaricare-allia-mcp)** · **[Domande frequenti](#domande-frequenti)**

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | **Italiano** | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

<a href="https://trendshift.io/repositories/347631" target="_blank"><img src="https://trendshift.io/api/badge/repositories/347631" alt="wangzi6224/bili-downloader | Trendshift" width="250" height="55"/></a>

<sub>Al momento l'interfaccia dell'app è disponibile solo in cinese semplificato. Questo README riporta ogni voce in cinese con la traduzione italiana.</sub>

</div>

## Prima dai un'occhiata

**Rimozione della filigrana con IA, prima e dopo**: a sinistra il download originale, a destra il ritocco IA.

https://github.com/user-attachments/assets/835dda86-4575-4311-808b-507c04bbd589

<sub>Fonte: «陈翔六点半：一念贪虚妄，半生困赌局», opera del creator bilibili 陈翔六点半. Video originale: [https://www.bilibili.com/video/BV1vU446BEiU](https://www.bilibili.com/video/BV1vU446BEiU). Tutti i diritti appartengono all’autore originale; vi invitiamo a guardare il video originale su bilibili.<br>Questo estratto è utilizzato esclusivamente per illustrare le funzionalità del software, solo a scopo di studio personale, e non può essere ridistribuito. Se ritenete che violi i vostri diritti, contattateci tramite [Issues](https://github.com/wangzi6224/bili-downloader/issues) e verrà rimosso tempestivamente.</sub>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="Coda dei download">
  <img src="docs/screenshots/select.png" width="49%" alt="Scelta di episodi, qualità e contenuti extra">
</p>

## Cosa ottieni

| | |
| --- | --- |
| **Qualità al massimo** <br> 8K, Dolby Vision, HDR: se il tuo account può guardarlo, puoi scaricarlo. Scegli tra AVC / HEVC / AV1, audio fino a Dolby Atmos e FLAC Hi-Res, e di default tieni i flussi originali, senza ricodifica. | **Basta un link** <br> Video singoli, video in più parti, raccolte, anime, film, corsi, preferiti, «Guarda più tardi», pagine degli autori, audio, classifiche… interi elenchi analizzati in un colpo solo, e funzionano anche i link brevi b23.tv e i testi di condivisione. |
| **Rimozione della filigrana con IA** <br> Le filigrane negli angoli vengono trovate in automatico, oppure tracci tu un riquadro; attiva il «Ritocco IA» e ricostruisce ciò che sta sotto, fotogramma per fotogramma. | **Sottotitoli, danmaku e tutto il resto** <br> Sottotitoli CC in `.srt` o incorporati nel video, danmaku in `.ass` / `.xml`, più capitoli, copertine e NFO per Kodi / Jellyfin. |
| **Metti in coda e pensa ad altro** <br> Download multithread con ripresa, limite di velocità, nuovi tentativi automatici e modelli di denominazione; abbonati ad autori, preferiti o raccolte e i nuovi caricamenti si scaricano da soli. | **Lascia fare all'IA** <br> Un server MCP locale integrato permette a Claude e ad altri client IA di cercare, analizzare link, mettere in coda download, rimuovere filigrane e tenere d'occhio l'avanzamento. |

> [!NOTE]
> Questo è un progetto non ufficiale, non affiliato né approvato da bilibili. Scarica solo contenuti che il tuo account è autorizzato a guardare, per uso personale, nel rispetto dei diritti dei creatori e dei termini di servizio di bilibili.

## Inizia in quattro passi

1. **Scarica** il programma di installazione per il tuo sistema dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest):

   | Sistema | File |
   | --- | --- |
   | macOS, Apple Silicon (M1 e successivi) | `bili-downloader-<version>-arm64.dmg` |
   | macOS, Intel | `bili-downloader-<version>-x64.dmg` |
   | Windows x64 | `bili-downloader-<version>-x64.exe` |
   | Linux x64 | `bili-downloader-<version>-x86_64.AppImage` oppure `bili-downloader-<version>-amd64.deb` |

2. **Accedi** al tuo account bilibili (vedi [Accesso](#accesso-e-privacy)). L'app ha bisogno di un account per analizzare i link.
3. **Incolla un link.** L'app lo rileva dagli appunti quando torni alla sua finestra; in alternativa premi <kbd>⌘</kbd><kbd>V</kbd> (<kbd>Ctrl</kbd><kbd>V</kbd> su Windows e Linux) nel campo di inserimento e fai clic su **解析** (Analizza).
4. **Scegli e scarica.** Scegli gli elementi (seleziona tutto, inverti la selezione, <kbd>Maiusc</kbd>-clic per un intervallo, oppure filtra per titolo o per numero, ad es. `1-5,7`), imposta qualità, tipo di output e contenuti extra, poi fai clic su **下载** (Scarica).

Al posto di un link puoi anche scrivere queste parole chiave: `稍后再看` o `watchlater` (Guarda più tardi), `每周必看` (consigliati della settimana), `排行榜` (classifiche).

## Installazione

### macOS

1. Scarica l'ultimo `.dmg` dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest): `arm64` per Apple Silicon, `x64` per Intel.
2. Apri il dmg e trascina **B站下载器** in **Applicazioni**.
3. L'app ha una firma ad hoc ma non è autenticata da Apple, quindi macOS la blocca al primo avvio. Prova ad aprirla una volta, poi vai in **Impostazioni di Sistema → Privacy e sicurezza** e fai clic su **Apri comunque**. (Da macOS 15 clic destro → Apri non funziona più.) In alternativa, esegui:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

Richiede macOS 12 o successivo.

### Windows

Scarica `bili-downloader-<version>-x64.exe` dalle [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) ed esegui il programma di installazione. Si installa per l'utente corrente e non richiede privilegi di amministratore. Il programma di installazione non è firmato, quindi Windows potrebbe mostrare un avviso di editore sconosciuto.

### Linux

<details>
<summary>AppImage o deb (solo x86 a 64 bit)</summary>

- **AppImage** (qualsiasi distribuzione, si aggiorna da sola): `bili-downloader-<version>-x86_64.AppImage`. Rendila eseguibile e avviala:

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  Le AppImage richiedono FUSE 2. Se non si avvia, installalo (`sudo apt install libfuse2t64` su Ubuntu 24.04 e successivi, `libfuse2` sulle versioni precedenti) oppure avviala con `--appimage-extract-and-run`.
- **deb** (Debian, Ubuntu e derivate): `bili-downloader-<version>-amd64.deb`. Installalo con `sudo apt install ./bili-downloader-<version>-amd64.deb`; **B站下载器** comparirà poi nel menu delle applicazioni.

Quando chiudi la finestra e l'app resta in background, fai clic sulla sua icona nell'area di notifica per riaprirla. Su GNOME serve l'estensione AppIndicator (Ubuntu la include di serie). La barra dei menu è nascosta; premi <kbd>Alt</kbd> per mostrarla.

</details>

### Aggiornamenti

Una volta installata, l'app controlla da sola gli aggiornamenti. L'app per macOS, il programma di installazione per Windows e l'AppImage per Linux li installano direttamente; la versione deb mostra le note di rilascio e ti rimanda alla pagina di download.

## Rimozione della filigrana con IA

Filigrana dell'autore piantata nell'angolo? Ci sono due modi per toglierla:

| Modalità | Come funziona | Ideale per |
| --- | --- | --- |
| **Rapida** (predefinita) | Individua la filigrana in un angolo e la riempie a partire dai pixel circostanti con il filtro `delogo` di ffmpeg | Risultati veloci, sfondi statici |
| **Ritocco IA** (AI 精修) | Ricostruisce fotogramma per fotogramma ciò che sta sotto la filigrana con il modello di inpainting [LaMa](https://github.com/advimman/lama) | Risultati molto più puliti, scene in movimento |

- Attivala nelle opzioni di download, oppure con l'interruttore **下载后去水印** (Rimuovi la filigrana dopo il download) sopra l'elenco dei download, che puoi cambiare in qualsiasi momento.
- Su un download già completato, traccia un riquadro sopra la filigrana e rimuovila a mano.
- Il ritocco IA mostra una stima del tempo prima di iniziare e usa la GPU quando è disponibile. Il modello (circa 200 MB) non è incluso nel programma di installazione: viene scaricato al primo utilizzo del ritocco IA e verificato tramite il suo SHA-256.
- La rimozione della filigrana ricodifica il video. I video HDR e Dolby Vision vengono saltati.

## Fai scaricare all'IA (MCP)

Attiva il server [Model Context Protocol](https://modelcontextprotocol.io) locale dell'app e i client IA come Claude possono cercare su bilibili, mettere in coda i download e seguire l'avanzamento per te. Una volta configurato, ti basta dire cosa vuoi:

> Cerca su bilibili video di «tutorial Blender» lunghi tra 30 e 60 minuti, scegli i cinque con più visualizzazioni e scaricali come un unico lotto.

L'agente chiama `search_videos` per trovare i candidati, `download_batch` con i cinque video per metterli in coda come un unico lotto e `get_batch_status` per seguirne l'avanzamento fino alla fine.

> Scarica tutti i video di questa raccolta che non ho ancora, poi rimuovi le filigrane con il ritocco IA: https://space.bilibili.com/…

Qui l'agente usa `parse_link` per espandere la raccolta, `download_batch` (gli elementi già scaricati vengono saltati), `get_batch_status` per vedere quali file hanno una filigrana e quanto richiederebbe la rimozione, e `remove_watermark` per ripulirli.

### Configurazione

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

<details>
<summary>Tutti gli strumenti MCP</summary>

| Strumento | Descrizione |
| --- | --- |
| `get_status` | Stato di accesso e dell'abbonamento premium (大会员), riepilogo della coda, spazio libero nella cartella di download e cose a cui fare attenzione. Da chiamare per primo |
| `parse_link` | Analizza un link bilibili (video, raccolta, anime, corso, preferiti, autore…); gli elenchi vengono sfogliati automaticamente. Gli id degli elementi sono stabili; i risultati si leggono a blocchi e i video in più parti si possono espandere |
| `download_batch` | Aggiunge un intero link o gli elementi scelti come un unico lotto e restituisce un `batch_id`. Per impostazione predefinita salta gli elementi già scaricati, e reinviare la stessa richiesta non scarica nulla due volte. Con `videos` più video, ad esempio i risultati di una ricerca, formano un unico lotto |
| `get_batch_status` | Avanzamento del lotto: attività per stato, velocità, tempo rimanente stimato, qualità effettiva, motivi degli errori, oltre ai video con la filigrana di Bilibili e al tempo richiesto da ciascuna modalità di rimozione. `wait_seconds` attende i cambiamenti |
| `list_batches` | Lotti inviati di recente |
| `list_tasks` | Elenca le attività a pagine, filtrate per lotto, stato o titolo |
| `control_tasks` | Mette in pausa, riprende, ritenta, riscarica o rimuove attività in blocco (i file scaricati non vengono mai eliminati), oppure annulla una rimozione della filigrana in corso |
| `remove_watermark` | Rimuove la filigrana dai video già scaricati, in modalità rapida o con ritocco IA; può prima stimare il tempo. Ricodifica e sostituisce il file originale |
| `get_settings` / `update_settings` | Legge o modifica cartella di download, download simultanei, thread, limite di velocità, tentativi automatici, qualità e opzioni predefinite |
| `search_videos` | Cerca video per parola chiave, con filtri per data e durata. I risultati includono titolo, autore, data di pubblicazione, durata, visualizzazioni, categoria, tag e un estratto della descrizione |
| `search_users` | Cerca autori per nome e restituisce `mid`, follower, numero di video e un link allo spazio utilizzabile con `parse_link` |
| `get_video_info` | Dettagli di massimo 20 video alla volta: statistiche, tag, descrizione, numero di parti e raccolta, con video correlati su richiesta |
| `get_video_transcript` | Il contenuto di un video: riassunto e scaletta IA di Bilibili, capitoli e sottotitoli completi, leggibili a blocchi. Non sono disponibili per tutti i video, e riassunto e sottotitoli IA richiedono l'accesso |
| `get_video_comments` | Commenti e risposte con paginazione a cursore, ordinati per popolarità o data. Senza accesso Bilibili ne restituisce solo pochi |
| `start_login` | Accede quando l'app non è connessa: importa l'accesso dal browser dell'utente (prima Chrome, usando i browser leggibili) oppure apre la finestra di accesso per scansionare il codice QR con `method=qr` |
| `get_login_status` | Segue l'accesso o elenca i browser del computer. Con `wait_seconds` risponde nel momento in cui l'accesso riesce: è così che l'agente sa che la scansione è finita |

</details>

Il server ascolta solo su `127.0.0.1` (la porta è configurabile), richiede il token Bearer e controlla le intestazioni `Host` / `Origin` per prevenire il DNS rebinding. Puoi rigenerare il token in qualsiasi momento.

## Elenco completo delle funzionalità

<details>
<summary>Link supportati</summary>

- Video (BV / av), video in più parti, raccolte, anime e film (ep / ss / md), corsi a pagamento
- Cartelle dei preferiti, «Guarda più tardi», video, raccolte e serie di un autore (con filtro per parola chiave)
- Tracce e playlist audio (au / am), «每周必看» (i consigliati della settimana) e classifiche di popolarità per categoria
- Link brevi (b23.tv e altri) e testi di condivisione che contengono anche il titolo
- Analisi di più link alla volta; caricamento pagina per pagina degli elenchi paginati (preferiti, pagine degli autori)

</details>

<details>
<summary>Qualità e formati</summary>

- L'elenco delle qualità arriva dall'API (8K / Dolby Vision / HDR / 4K / 1080P60 / …), con i livelli riservati agli abbonati premium (大会员) evidenziati
- Priorità dei codec AVC / HEVC / AV1; audio fino a Dolby Atmos e FLAC lossless Hi-Res
- Video completo, solo audio o solo video; MP4 o MKV
- Per impostazione predefinita ffmpeg copia i flussi direttamente nel file finale, senza ricodifica; il video viene ricodificato solo se la rimozione della filigrana è attiva

</details>

<details>
<summary>Contenuti extra</summary>

- Copertina: salvata come immagine e/o incorporata nel file
- Sottotitoli CC: salvati come `.srt` e/o incorporati nel video
- Danmaku (commenti a scorrimento) in `.ass` e/o `.xml`, con dimensione del carattere, opacità e durata regolabili
- I segmenti della barra di avanzamento di bilibili, scritti come veri capitoli
- Metadati NFO per le librerie multimediali Kodi / Jellyfin
- Rimozione della filigrana, in modalità rapida o con ritocco IA (vedi [Rimozione della filigrana con IA](#rimozione-della-filigrana-con-ia))

</details>

<details>
<summary>Coda e rete</summary>

- Download simultanei, download multithread a segmenti, limite di velocità e nuovi tentativi automatici in caso di errori di rete, tutti regolabili
- Pausa, ripresa e ripresa anche dopo un riavvio; le attività non scaricabili mostrano chiaramente il motivo
- Proxy: diretto, di sistema o manuale; test di latenza integrato per scegliere il nodo CDN bilibili più veloce
- Possibilità di impedire la sospensione del computer (o dello schermo) durante i download e notifica a coda completata

</details>

<details>
<summary>Organizzazione e automazione</summary>

- Modelli di denominazione con variabili (`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}`, …), segmenti opzionali e livelli di cartelle, impostabili separatamente per video singoli, raccolte e anime
- Riconosce i contenuti già scaricati e chiede / salta / scarica di nuovo
- Abbonamenti: controlla periodicamente preferiti, raccolte o autori e scarica automaticamente le novità
- Cronologia delle analisi, monitoraggio degli appunti, tema chiaro / scuro, esecuzione in background, importazione / esportazione delle impostazioni
- Aggiornamenti integrati da GitHub Releases, con note di rilascio e possibilità di saltare una versione

</details>

## Accesso e privacy

Accedi e puoi scaricare tutte le qualità e tutti i video che il tuo account può guardare, compresi 1080P e oltre e i contenuti premium. Ci sono tre modi:

- **从浏览器导入** (Importa dal browser): riutilizza i cookie di accesso di Chrome, Edge, Brave, Arc (solo macOS), Vivaldi, Opera, Chromium, Firefox o Safari (solo macOS).
  - macOS protegge i dati di Chrome, Edge, Brave e Safari: abilita prima l'app in **Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco** e riavviala. L'importazione dai browser basati su Chromium chiede anche l'accesso al Portachiavi.
  - Su Linux i browser basati su Chromium conservano la chiave dei cookie nel portachiavi di sistema (GNOME Keyring / libsecret). L'app la legge con `secret-tool` (`sudo apt install libsecret-tools`) e il portachiavi potrebbe chiederti di sbloccarlo. Sono supportati anche Firefox installato tramite Snap o Flatpak e Chromium in versione Snap.
  - Su Windows i browser basati su Chromium bloccano il database dei cookie mentre sono in esecuzione, quindi chiudi completamente il browser (compresi eventuali processi in background) prima di importare. I cookie scritti da Chrome 127 o successivo usano la crittografia legata all'app e non possono essere importati; se il cookie di accesso è tra questi, usa invece l'accesso nell'app oppure incolla una stringa di cookie.
- **在应用内登录** (Accedi nell'app): apre la pagina di accesso ufficiale di bilibili, con accesso tramite codice QR, password o SMS.
- **手动粘贴 Cookie** (Incolla i cookie): una stringa di cookie separati da punto e virgola, oppure il JSON esportato da un'estensione del browser.

L'app controlla lo stato di accesso all'avvio, quando torni alla finestra, durante l'analisi e ogni volta che l'API segnala una sessione scaduta. Se l'accesso è scaduto, ti chiede di accedere di nuovo, sospende il recupero dei flussi e riprende la coda una volta rientrato. La disconnessione cancella solo i cookie dell'app, senza disconnetterti dal browser.

**Dove finiscono i tuoi dati**

- I tuoi cookie di bilibili sono conservati nella cartella dati dell'app e vengono inviati solo a bilibili. Non vengono mai restituiti ai client IA tramite MCP.
- Download, unione dei flussi e rimozione della filigrana avvengono tutti in locale. Nessuna registrazione, nessuna telemetria e nessun nostro server di mezzo.
- Oltre a bilibili, l'app contatta solo GitHub (per controllare gli aggiornamenti) e ModelScope o Hugging Face (per scaricare una volta il modello del ritocco IA).
- Tramite MCP, `start_login` non fa nulla se l'app è già connessa, quindi un agente non può cambiare account. Se prima bisogna chiudere un browser (su Windows il database dei cookie è bloccato mentre il browser è in esecuzione), l'app te lo chiede in una finestra di dialogo e solo tu puoi approvare.

## Domande frequenti

<details>
<summary>Posso usarla senza accedere?</summary>

No. L'app richiede l'accesso prima di poter analizzare i link, e le qualità disponibili sono quelle che il tuo account può guardare.

</details>

<details>
<summary>Perché non posso scegliere 1080P / 4K / 8K?</summary>

L'elenco delle qualità arriva direttamente da bilibili per il tuo account. I livelli più alti (1080P+ ad alto bitrate, 4K, 8K, HDR, Dolby Vision) di solito richiedono un abbonamento premium (大会员), e non tutti i video sono caricati in tutte le qualità.

</details>

<details>
<summary>macOS dice che l'app non può essere aperta. E adesso?</summary>

L'app non è autenticata da Apple. Aprila una volta, poi fai clic su **Apri comunque** in **Impostazioni di Sistema → Privacy e sicurezza**, oppure esegui il comando `xattr` indicato in [Installazione](#macos).

</details>

<details>
<summary>Windows dice «PC protetto da Windows». Che faccio?</summary>

Il programma di installazione non ha una firma del codice. Fai clic su **Ulteriori informazioni → Esegui comunque**.

</details>

<details>
<summary>Perché un'attività dice 无法下载 (impossibile scaricare)?</summary>

Non è possibile scaricare contenuti protetti da DRM, con restrizioni geografiche o che il tuo account non è autorizzato a guardare. L'attività mostra il motivo.

</details>

<details>
<summary>Perché la rimozione della filigrana è così lenta?</summary>

Il ritocco IA ricostruisce ogni fotogramma, quindi è molto più lento della modalità rapida, soprattutto senza GPU. L'app mostra una stima del tempo prima di iniziare; usa la modalità rapida quando la velocità conta più della qualità.

</details>

<details>
<summary>L'app è disponibile in italiano?</summary>

Non ancora. Al momento l'interfaccia è disponibile solo in cinese semplificato; questo README traduce ogni voce che cita.

</details>

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
src/main/watermark          Rilevamento e rimozione della filigrana (delogo di ffmpeg); ai/ è il ritocco IA (modello LaMa su onnxruntime)
src/main/net                Proxy e scelta del CDN
src/main/update             Aggiornamenti integrati: controllo di update.json, verifica dei download, installazione degli aggiornamenti .app / AppImage / NSIS
src/main/mcp                Server MCP locale
src/main/subscriptions.ts   Abbonamenti
src/shared                  Tipi, analisi dei link e modelli di denominazione condivisi tra i processi
src/renderer                Interfaccia (React + Tailwind CSS + zustand)
scripts                     Download di ffmpeg, generazione delle icone, pubblicazione dei rilasci
website                     Sito del prodotto (Next.js, pubblicato su GitHub Pages)
```

## Contribuire

Issue e pull request sono benvenute. Leggi prima [CONTRIBUTING.md](CONTRIBUTING.md). Ti piace? Lascia una ⭐, così la trovano più persone.

## Ringraziamenti

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) per la documentazione delle API di bilibili
- [FFmpeg](https://ffmpeg.org) e [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## Licenza

[MIT](LICENSE) © wangzi6224

L'app include binari FFmpeg statici provenienti da [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (`b6.1.1`). FFmpeg viene eseguito come programma separato con la propria licenza e non è coperto dalla licenza MIT indicata sopra. Il testo della sua licenza è incluso nell'app in `Contents/Resources/ffmpeg/LICENSE` (macOS) / `resources/ffmpeg/LICENSE` (Windows e Linux); vedi anche [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html).

Il ritocco IA esegue il modello di inpainting [LaMa](https://github.com/advimman/lama) (Apache-2.0; esportazione ONNX di [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX)) con [onnxruntime](https://github.com/microsoft/onnxruntime) (MIT, incluso nell'app). Il modello non è incluso nel programma di installazione: viene scaricato al primo utilizzo del ritocco IA.
