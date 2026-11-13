<div align="center">

<img src="build/icon.png" width="128" alt="Icône de Bili Downloader">

# Bili Downloader

**Vos vidéos bilibili préférées, direct sur votre disque.** Copiez un lien, collez-le, cliquez sur télécharger : vidéos, collections, animés et cours arrivent d'un coup, jusqu'en 8K / Dolby Vision, avec sous-titres, danmaku et chapitres enregistrés à côté. Effacez les filigranes par IA au passage, ou laissez un agent IA faire le boulot. Gratuit et open source, pour Windows, macOS et Linux.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
[![Stars](https://img.shields.io/github/stars/wangzi6224/bili-downloader?style=flat)](https://github.com/wangzi6224/bili-downloader/stargazers)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[![Download for macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/wangzi6224/bili-downloader/releases/latest)

**[Site web](https://wangzi6224.github.io/bili-downloader/)** · **[Télécharger](https://github.com/wangzi6224/bili-downloader/releases/latest)** · **[Lancez-vous](#lancez-vous-en-quatre-étapes)** · **[Laissez faire l'IA (MCP)](#laissez-lia-télécharger-pour-vous-mcp)** · **[FAQ](#faq)**

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Français** | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

<sub>Depuis la v0.13.0, l'interface est disponible en français, anglais, chinois simplifié, japonais, coréen, italien, russe et hindi. Elle suit la langue du système par défaut et peut être modifiée dans les paramètres.</sub>

</div>

## D'abord, un coup d'œil

**Suppression du filigrane par IA, avant / après** : le téléchargement d'origine à gauche, la retouche IA à droite.

https://github.com/user-attachments/assets/835dda86-4575-4311-808b-507c04bbd589

<sub>Source : « 陈翔六点半：一念贪虚妄，半生困赌局 », œuvre du créateur bilibili 陈翔六点半. Vidéo originale : [https://www.bilibili.com/video/BV1vU446BEiU](https://www.bilibili.com/video/BV1vU446BEiU). Tous les droits appartiennent à l’auteur original ; nous vous invitons à regarder la vidéo originale sur bilibili.<br>Cet extrait est utilisé uniquement pour présenter les fonctionnalités du logiciel, à des fins d’étude personnelle, et ne doit pas être redistribué. Si vous estimez qu’il porte atteinte à vos droits, veuillez nous contacter via [Issues](https://github.com/wangzi6224/bili-downloader/issues) : il sera retiré dans les plus brefs délais.</sub>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="File de téléchargement">
  <img src="docs/screenshots/select.png" width="49%" alt="Choix des épisodes, de la qualité et des extras">
</p>

## Ce qu'il y a dedans

| | |
| --- | --- |
| **La qualité à fond** <br> 8K, Dolby Vision, HDR : si votre compte peut le regarder, vous pouvez le télécharger. Choisissez AVC / HEVC / AV1, profitez d'un audio jusqu'au Dolby Atmos et au FLAC Hi-Res, et gardez par défaut les flux d'origine, sans réencodage. | **Un lien, et c'est tout** <br> Vidéos simples, vidéos en plusieurs parties, collections, animés, films, cours, favoris, « À regarder plus tard », pages de créateurs, audio, classements… les listes entières sont analysées d'un coup, et les liens courts b23.tv comme les textes de partage marchent aussi. |
| **Suppression du filigrane par IA** <br> Les filigranes dans les coins sont repérés tout seuls, sinon tracez un cadre vous-même ; activez la « Retouche IA » et elle repeint ce qui se trouve dessous, image par image. | **Sous-titres, danmaku, et tout le reste** <br> Sous-titres CC en `.srt` ou intégrés à la vidéo, danmaku en `.ass` / `.xml`, plus chapitres, couvertures et NFO pour Kodi / Jellyfin. |
| **Lancez la file et passez à autre chose** <br> Téléchargements reprenables et multithread, avec limite de débit, nouvelles tentatives automatiques et modèles de nommage ; abonnez-vous à des créateurs, des favoris ou des collections, et les nouvelles vidéos se téléchargent toutes seules. | **Laissez l'IA s'en charger** <br> Un serveur MCP local intégré permet à Claude et à d'autres clients IA de chercher, d'analyser des liens, d'ajouter des téléchargements à la file, de retirer des filigranes et de garder un œil sur la progression. |

> [!NOTE]
> Ce projet est non officiel et n'est ni affilié à bilibili ni approuvé par bilibili. Ne téléchargez que des contenus que votre propre compte est autorisé à regarder, pour un usage personnel, en respectant les droits des créateurs et les conditions d'utilisation de bilibili.

## Lancez-vous en quatre étapes

1. **Téléchargez** le programme d'installation pour votre système depuis les [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) :

   | Système | Fichier |
   | --- | --- |
   | macOS, Apple Silicon (M1 et ultérieurs) | `bili-downloader-<version>-arm64.dmg` |
   | macOS, Intel | `bili-downloader-<version>-x64.dmg` |
   | Windows x64 | `bili-downloader-<version>-x64.exe` |
   | Linux x64 | `bili-downloader-<version>-x86_64.AppImage` ou `bili-downloader-<version>-amd64.deb` |

2. **Connectez-vous** à votre compte bilibili (voir [Connexion](#connexion-et-vie-privée)). L'application a besoin d'un compte pour analyser les liens.
3. **Collez un lien.** L'application le récupère dans le presse-papiers quand vous revenez dessus ; vous pouvez aussi appuyer sur <kbd>⌘</kbd><kbd>V</kbd> (<kbd>Ctrl</kbd><kbd>V</kbd> sous Windows et Linux) dans le champ de saisie puis cliquer sur **解析** (Analyser).
4. **Choisissez et téléchargez.** Sélectionnez les éléments (tout sélectionner, inverser la sélection, <kbd>Maj</kbd>-clic pour une plage, ou filtrer par titre ou par numéro, par ex. `1-5,7`), réglez la qualité, le type de sortie et les extras, puis cliquez sur **下载** (Télécharger).

Vous pouvez aussi saisir ces mots-clés à la place d'un lien : `稍后再看` ou `watchlater` (À regarder plus tard), `每周必看` (sélection de la semaine), `排行榜` (classements).

## Installation

### macOS

1. Téléchargez le dernier `.dmg` depuis les [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) : `arm64` pour Apple Silicon, `x64` pour Intel.
2. Ouvrez le dmg et faites glisser **B站下载器** dans **Applications**.
3. L'application est signée ad hoc mais pas notarisée, donc macOS la bloque au premier lancement. Essayez de l'ouvrir une fois, puis allez dans **Réglages Système → Confidentialité et sécurité** et cliquez sur **Ouvrir quand même**. (Depuis macOS 15, clic droit → Ouvrir ne fonctionne plus.) Vous pouvez aussi exécuter :

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

macOS 12 ou ultérieur est requis.

### Windows

Téléchargez `bili-downloader-<version>-x64.exe` depuis les [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) et lancez le programme d'installation. Il s'installe pour l'utilisateur actuel et ne nécessite pas de droits d'administrateur. Le programme d'installation n'étant pas signé, Windows peut afficher un avertissement indiquant un éditeur inconnu.

### Linux

<details>
<summary>AppImage ou deb (x86 64 bits uniquement)</summary>

- **AppImage** (toutes distributions, se met à jour d'elle-même) : `bili-downloader-<version>-x86_64.AppImage`. Rendez-la exécutable puis lancez-la :

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  Les AppImage nécessitent FUSE 2. Si elle ne démarre pas, installez-le (`sudo apt install libfuse2t64` sur Ubuntu 24.04 et versions ultérieures, `libfuse2` sur les versions plus anciennes), ou lancez-la avec `--appimage-extract-and-run`.
- **deb** (Debian, Ubuntu et dérivées) : `bili-downloader-<version>-amd64.deb`. Installez-le avec `sudo apt install ./bili-downloader-<version>-amd64.deb` ; **B站下载器** apparaît ensuite dans le menu des applications.

Quand la fenêtre est fermée et que l'application continue en arrière-plan, cliquez sur son icône dans la zone de notification pour la faire réapparaître. Sous GNOME, il faut pour cela l'extension AppIndicator (installée par défaut sur Ubuntu). La barre de menus est masquée ; appuyez sur <kbd>Alt</kbd> pour l'afficher.

</details>

### Mises à jour

Une fois installée, l'application vérifie elle-même les mises à jour. L'application macOS, le programme d'installation Windows et l'AppImage Linux les installent directement ; la version deb affiche les notes de version et vous renvoie vers la page de téléchargement.

## Suppression du filigrane par IA

Le filigrane du créateur squatte un coin de l'image ? Deux façons de s'en débarrasser :

| Mode | Fonctionnement | Idéal pour |
| --- | --- | --- |
| **Rapide** (par défaut) | Repère le filigrane dans un coin et le comble à partir des pixels voisins avec le filtre `delogo` de ffmpeg | Résultats rapides, arrière-plans fixes |
| **Retouche IA** (AI 精修) | Repeint image par image ce qui se trouve sous le filigrane avec le modèle de restauration [LaMa](https://github.com/advimman/lama) | Résultats bien plus nets, scènes en mouvement |

- Activez-la dans les options de téléchargement, ou avec l'interrupteur **下载后去水印** (Retirer le filigrane après le téléchargement) au-dessus de la liste des téléchargements, modifiable à tout moment.
- Sur un téléchargement terminé, tracez un cadre autour du filigrane pour le retirer à la main.
- La retouche IA affiche une durée estimée avant de commencer et utilise la carte graphique si elle est disponible. Le modèle (environ 200 Mo) n'est pas inclus dans le programme d'installation ; il est téléchargé à la première utilisation de la retouche IA et vérifié par son empreinte SHA-256.
- Retirer un filigrane réencode la vidéo. Les vidéos HDR et Dolby Vision ne sont pas traitées.

## Laissez l'IA télécharger pour vous (MCP)

Activez le serveur [Model Context Protocol](https://modelcontextprotocol.io) local de l'application, et des clients IA comme Claude peuvent chercher sur bilibili, ajouter des téléchargements à la file et suivre la progression à votre place. Une fois que c'est réglé, dites simplement ce que vous voulez :

> Cherche sur bilibili des vidéos « tutoriel Blender » de 30 à 60 minutes, prends les cinq les plus vues et télécharge-les en un seul lot.

L'agent appelle `search_videos` pour trouver des candidates, `download_batch` avec les cinq vidéos pour les ajouter à la file en un seul lot, et `get_batch_status` pour suivre l'avancement jusqu'à la fin.

> Télécharge toutes les vidéos de cette collection que je n'ai pas encore, puis retire les filigranes avec la retouche IA : https://space.bilibili.com/…

Ici, l'agent utilise `parse_link` pour déplier la collection, `download_batch` (les éléments déjà téléchargés sont ignorés), `get_batch_status` pour voir quels fichiers portent un filigrane et combien de temps prendrait sa suppression, et `remove_watermark` pour les nettoyer.

### Configuration

Dans **设置 → AI 助手** (Réglages → Assistants IA), cliquez sur **全部安装** (Tout installer), ou installez pour un seul assistant. En un clic, le serveur MCP et une skill sont ajoutés à :

Claude Code · Claude Desktop (macOS, Windows) · Codex · Cursor · Gemini CLI · WorkBuddy · CodeBuddy · Trae CN · Qoder · Qwen Code

- Redémarrez ensuite l’assistant. Dès lors, toute conversation qui demande de télécharger depuis bilibili ou d’y faire une recherche utilisera cette application.
- Aucun jeton n’est enregistré dans la configuration des assistants : ils lancent un petit pont qui lit le port et le jeton actuels de l’application, et ouvre l’application en arrière-plan (icône dans la barre seulement) si elle n’est pas lancée.
- Quand l’application est mise à jour ou déplacée, les configurations et skills installées sont mises à jour au lancement suivant. Ce que vous retirez dans un assistant n’est pas réinstallé.

Les autres clients peuvent toujours se connecter en HTTP : les boutons de **接入 AI 客户端** (Connecter un client IA) sur la même page copient la configuration du client (JSON) ou la commande Claude Code, avec votre jeton d’accès déjà inclus.

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
<summary>Tous les outils MCP</summary>

| Outil | Description |
| --- | --- |
| `get_status` | État de connexion et de l'abonnement premium (大会员), résumé de la file, espace libre du dossier de téléchargement et points à surveiller. À appeler en premier |
| `parse_link` | Analyse un lien bilibili (vidéo, collection, animé, cours, favoris, créateur…) ; les listes sont parcourues page par page automatiquement. Les identifiants des éléments sont stables ; les résultats se lisent par tranches et les vidéos en plusieurs parties peuvent être dépliées |
| `download_batch` | Ajoute tout un lien ou les éléments choisis en un seul lot et renvoie un `batch_id`. Les éléments déjà téléchargés sont ignorés par défaut, et renvoyer la même demande ne télécharge rien deux fois. Avec `videos`, plusieurs vidéos, par exemple des résultats de recherche, forment un seul lot |
| `get_batch_status` | Avancement d'un lot : nombre de tâches par état, vitesse, temps restant estimé, qualité obtenue, causes d'échec, ainsi que les vidéos portant un filigrane Bilibili et la durée de chaque mode de suppression. `wait_seconds` attend les changements |
| `list_batches` | Lots soumis récemment |
| `list_tasks` | Liste les tâches par pages, filtrées par lot, état ou titre |
| `control_tasks` | Met en pause, reprend, relance, retélécharge ou retire des tâches en masse (les fichiers téléchargés ne sont jamais supprimés), ou annule une suppression de filigrane en cours |
| `remove_watermark` | Retire le filigrane de vidéos déjà téléchargées, en mode rapide ou retouche IA ; peut d'abord seulement estimer la durée. Réencode et remplace le fichier d'origine |
| `get_settings` / `update_settings` | Lit ou modifie le dossier de téléchargement, le nombre de téléchargements simultanés, les threads, la limite de débit, les nouvelles tentatives automatiques, la qualité et les options par défaut |
| `search_videos` | Recherche des vidéos par mot-clé, avec filtres par date et durée. Les résultats indiquent le titre, l'auteur, la date de publication, la durée, le nombre de vues, la catégorie, les tags et un résumé de la description |
| `search_users` | Recherche des créateurs par nom et renvoie leur `mid`, leurs abonnés, leur nombre de vidéos et un lien d'espace utilisable avec `parse_link` |
| `get_video_info` | Détails de 20 vidéos maximum à la fois : statistiques, tags, description, nombre de parties et collection, avec les vidéos associées en option |
| `get_video_transcript` | Le contenu d'une vidéo : résumé et plan générés par l'IA de Bilibili, chapitres et sous-titres complets, lisibles par morceaux. Ils ne sont pas disponibles pour toutes les vidéos, et le résumé et les sous-titres IA exigent une connexion |
| `get_video_comments` | Commentaires et réponses avec pagination par curseur, triés par popularité ou par date. Sans connexion, Bilibili n'en renvoie que quelques-uns |
| `start_login` | Se connecte quand l'application ne l'est pas : importe la connexion du navigateur de l'utilisateur (Chrome d'abord, en utilisant les navigateurs lisibles), ou ouvre la fenêtre de connexion pour scanner un QR code avec `method=qr` |
| `get_login_status` | Suit la connexion ou liste les navigateurs de l'ordinateur. Avec `wait_seconds`, il répond dès que la connexion réussit : c'est ainsi que l'agent sait que le scan est terminé |

</details>

Le serveur n'écoute que sur `127.0.0.1` (le port est configurable), exige le jeton Bearer et vérifie les en-têtes `Host` / `Origin` pour empêcher le DNS rebinding. Vous pouvez régénérer le jeton à tout moment.

## La liste complète des fonctionnalités

<details>
<summary>Liens pris en charge</summary>

- Vidéos (BV / av), vidéos en plusieurs parties, collections, animés et films (ep / ss / md), cours payants
- Dossiers de favoris, « À regarder plus tard », vidéos, collections et séries d'un créateur (avec filtre par mot-clé)
- Pistes audio et playlists audio (au / am), « 每周必看 » (sélection de la semaine) et classements par catégorie
- Liens courts (b23.tv et autres) et textes de partage contenant le titre
- Analyse de plusieurs liens à la fois ; chargement page par page des listes paginées (favoris, pages de créateurs)

</details>

<details>
<summary>Qualité et formats</summary>

- Liste des qualités fournie par l'API (8K / Dolby Vision / HDR / 4K / 1080P60 / …), avec les niveaux réservés aux abonnés premium (大会员) signalés
- Priorité des codecs AVC / HEVC / AV1 ; audio jusqu'au Dolby Atmos et au FLAC sans perte Hi-Res
- Vidéo complète, audio seul ou vidéo seule ; MP4 ou MKV
- Par défaut, ffmpeg copie directement les flux dans le fichier final, sans réencodage ; la vidéo n'est réencodée que si la suppression du filigrane est activée

</details>

<details>
<summary>Extras</summary>

- Couverture : enregistrée comme image et/ou intégrée au fichier
- Sous-titres CC : enregistrés en `.srt` et/ou intégrés à la vidéo
- Danmaku (commentaires défilants) en `.ass` et/ou `.xml`, avec taille de police, opacité et durée réglables
- Les segments de la barre de progression de bilibili, écrits comme de vrais chapitres
- Métadonnées NFO pour les médiathèques Kodi / Jellyfin
- Suppression du filigrane, en mode rapide ou retouche IA (voir [Suppression du filigrane par IA](#suppression-du-filigrane-par-ia))

</details>

<details>
<summary>File d'attente et réseau</summary>

- Téléchargements simultanés, téléchargement multithread par segments, limite de débit et nouvelle tentative automatique en cas d'erreur réseau, tous réglables
- Pause, reprise, et reprise même après un redémarrage ; les tâches impossibles à télécharger indiquent clairement pourquoi
- Proxy : direct, système ou manuel ; test de latence intégré pour choisir le nœud CDN bilibili le plus rapide
- Empêcher la mise en veille de l'ordinateur (ou de l'écran) pendant les téléchargements, et notification quand la file est terminée

</details>

<details>
<summary>Organisation et automatisation</summary>

- Modèles de nommage avec variables (`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}`, …), segments facultatifs et niveaux de dossiers, réglables séparément pour les vidéos seules, les collections et les animés
- Détection des contenus déjà téléchargés : demander, ignorer ou retélécharger
- Abonnements : vérification périodique de favoris, collections ou créateurs, avec téléchargement automatique des nouveautés
- Historique des analyses, surveillance du presse-papiers, thème clair / sombre, exécution en arrière-plan, import / export des réglages
- Mises à jour intégrées depuis GitHub Releases, avec notes de version et possibilité d'ignorer une version

</details>

## Connexion et vie privée

Connectez-vous et vous pourrez télécharger toutes les qualités et toutes les vidéos que votre compte peut regarder, 1080P et plus et contenus premium compris. Choisissez la méthode qui vous convient parmi les trois :

- **从浏览器导入** (Importer depuis le navigateur) : réutilise les cookies de connexion de Chrome, Edge, Brave, Arc (macOS uniquement), Vivaldi, Opera, Chromium, Firefox ou Safari (macOS uniquement).
  - Si macOS bloque la lecture, sélectionnez le dossier de données du navigateur concerné depuis la fenêtre de connexion. L’import depuis un navigateur basé sur Chromium peut aussi demander l’accès au trousseau.
  - Sous Linux, les navigateurs basés sur Chromium conservent la clé des cookies dans le trousseau du système (GNOME Keyring / libsecret). L'application la lit avec `secret-tool` (`sudo apt install libsecret-tools`), et le trousseau peut demander à être déverrouillé. Les versions Snap et Flatpak de Firefox, ainsi que Chromium en Snap, sont également prises en charge.
  - Sous Windows, les navigateurs basés sur Chromium verrouillent leur base de données de cookies pendant leur exécution : quittez complètement le navigateur (y compris ses processus en arrière-plan) avant l'import. Les cookies écrits par Chrome 127 ou ultérieur utilisent le chiffrement lié à l'application et ne peuvent pas être importés ; si le cookie de connexion en fait partie, utilisez plutôt la connexion dans l'application ou collez une chaîne de cookies.
- **在应用内登录** (Se connecter dans l'application) : ouvre la page de connexion officielle de bilibili, avec connexion par QR code, mot de passe ou SMS.
- **手动粘贴 Cookie** (Coller les cookies) : une chaîne de cookies séparés par des points-virgules, ou le JSON exporté par une extension de navigateur.

L'application vérifie l'état de connexion au lancement, au retour sur la fenêtre, pendant l'analyse et chaque fois que l'API signale une session expirée. Si la connexion a expiré, elle vous demande de vous reconnecter, suspend la récupération des flux et reprend la file une fois reconnecté. La déconnexion efface uniquement les cookies de l'application, sans vous déconnecter de votre navigateur.

**Où vont vos données**

- Vos cookies bilibili sont conservés dans le dossier de données de l'application et ne sont envoyés qu'à bilibili. Ils ne sont jamais renvoyés aux clients IA via MCP.
- Les téléchargements, le multiplexage et la suppression du filigrane s'exécutent tous en local. Pas d'inscription, pas de télémétrie, aucun serveur à nous entre les deux.
- En dehors de bilibili, l'application ne contacte que GitHub (pour vérifier les mises à jour) et ModelScope ou Hugging Face (pour télécharger une seule fois le modèle de retouche IA).
- Le client MCP peut changer de compte ou déconnecter un compte précis à votre demande. S'il faut d'abord fermer un navigateur (Windows verrouille la base de cookies tant que le navigateur tourne), l'application vous le demande dans une boîte de dialogue et vous seul pouvez l'accepter.

## FAQ

<details>
<summary>Je peux l'utiliser sans me connecter ?</summary>

Non. L'application exige que vous vous connectiez avant de pouvoir analyser des liens, et les qualités disponibles sont celles que votre compte peut regarder.

</details>

<details>
<summary>Pourquoi je ne peux pas choisir 1080P / 4K / 8K ?</summary>

La liste des qualités vient directement de bilibili pour votre compte. Les niveaux supérieurs (1080P+ haut débit, 4K, 8K, HDR, Dolby Vision) nécessitent généralement un compte premium (大会员), et toutes les vidéos ne sont pas mises en ligne dans toutes les qualités.

</details>

<details>
<summary>macOS dit que l'application ne peut pas être ouverte. Je fais quoi ?</summary>

L'application n'est pas notarisée par Apple. Ouvrez-la une fois, puis cliquez sur **Ouvrir quand même** dans **Réglages Système → Confidentialité et sécurité**, ou exécutez la commande `xattr` indiquée dans [Installation](#macos).

</details>

<details>
<summary>Windows affiche « Windows a protégé votre ordinateur ». Que faire ?</summary>

Le programme d'installation n'est pas signé. Cliquez sur **Informations complémentaires → Exécuter quand même**.

</details>

<details>
<summary>Pourquoi une tâche indique 无法下载 (téléchargement impossible) ?</summary>

Les contenus protégés par DRM, soumis à des restrictions géographiques ou que votre compte n'est pas autorisé à regarder ne peuvent pas être téléchargés. La tâche en indique la raison.

</details>

<details>
<summary>Pourquoi la suppression du filigrane est si lente ?</summary>

La retouche IA repeint chaque image, elle est donc bien plus lente que le mode rapide, surtout sans carte graphique. L'application affiche une durée estimée avant de commencer ; utilisez le mode rapide quand la vitesse compte plus que la qualité.

</details>

<details>
<summary>L'application existe en français ?</summary>

Oui. Depuis la v0.13.0, l'interface prend en charge le français et sept autres langues. Elle suit la langue du système par défaut et peut être modifiée dans les paramètres.

</details>

## Limitations

- Les contenus protégés par DRM, soumis à des restrictions géographiques ou que votre compte n'est pas autorisé à regarder ne peuvent pas être téléchargés. Ces tâches sont marquées **无法下载** (téléchargement impossible) avec la raison.
- Windows x64, macOS x64 / arm64 et Linux x64 sont pris en charge. Aucune version ARM n'est fournie pour Windows ni pour Linux.

## Compiler depuis les sources

Nécessite Windows, macOS ou Linux, Node.js 22.12 ou ultérieur et npm.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # mode développement
npm test             # tests unitaires
npm run typecheck    # vérification des types
npm run build:mac    # sous macOS : génère les dmg / zip x64 et arm64 dans dist/
npm run build:linux  # sous Linux : génère l'AppImage / le deb x64 dans dist/
npm run build:win    # sous Windows : génère le programme d'installation NSIS x64 dans dist/
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais) pour le flux de développement et [docs/RELEASING.md](docs/RELEASING.md) (en chinois) pour l'empaquetage et les publications.

## Structure du projet

```
src/main/auth               Connexion : stockage des cookies, fenêtre de connexion, import depuis le navigateur, détection d'expiration
src/main/bili               API bilibili : signature WBI, analyse des vidéos / animés / cours / listes, flux, sous-titres, danmaku
src/main/download           File de téléchargement, reprise, multiplexage ffmpeg, extras (couverture, sous-titres, NFO…)
src/main/watermark          Détection et suppression du filigrane (delogo de ffmpeg) ; ai/ : retouche IA (modèle LaMa sur onnxruntime)
src/main/net                Proxy et choix du CDN
src/main/update             Mises à jour intégrées : vérification de update.json, contrôle des téléchargements, installation des mises à jour .app / AppImage / NSIS
src/main/mcp                Serveur MCP local
src/main/agents             Installation en un clic du serveur MCP et de la skill dans les assistants IA
src/bridge                  Pont stdio lancé par les assistants IA pour joindre le serveur MCP
src/main/subscriptions.ts   Abonnements
src/shared                  Types, analyse des liens et modèles de nommage partagés entre les processus
src/renderer                Interface (React + Tailwind CSS + zustand)
scripts                     Récupération de ffmpeg, génération des icônes, publication des versions
website                     Site du produit (Next.js, déployé sur GitHub Pages)
```

## Contribuer

Les issues et pull requests sont les bienvenues. Merci de lire d'abord [CONTRIBUTING.md](CONTRIBUTING.md). Ça vous plaît ? Laissez une ⭐, ça aide d'autres gens à tomber dessus.

## Remerciements

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) pour sa documentation des API bilibili
- [FFmpeg](https://ffmpeg.org) et [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## Licence

[MIT](LICENSE) © wangzi6224

L'application intègre des binaires FFmpeg statiques issus de [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (`b6.1.1`). FFmpeg s'exécute comme un programme distinct sous sa propre licence et n'est pas couvert par la licence MIT ci-dessus. Le texte de sa licence est fourni dans l'application, dans `Contents/Resources/ffmpeg/LICENSE` (macOS) / `resources/ffmpeg/LICENSE` (Windows et Linux) ; voir aussi [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html).

La retouche IA exécute le modèle de restauration [LaMa](https://github.com/advimman/lama) (Apache-2.0 ; export ONNX de [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX)) avec [onnxruntime](https://github.com/microsoft/onnxruntime) (MIT, inclus dans l'application). Le modèle n'est pas fourni avec l'installateur : il est téléchargé à la première utilisation de la retouche IA.
