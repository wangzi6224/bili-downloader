<div align="center">

<img src="build/icon.png" width="128" alt="Icône de Bili Downloader">

# Bili Downloader

Une application de bureau macOS pour télécharger depuis bilibili : collez un lien pour récupérer des vidéos, des vidéos en plusieurs parties, des collections, des animés et des films.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
![macOS 12+](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)
![Apple Silicon | Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-blue)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Français** | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="File de téléchargement">
  <img src="docs/screenshots/select.png" width="49%" alt="Choix des épisodes, de la qualité et des extras">
</p>

> [!NOTE]
> Ce projet est non officiel et n'est ni affilié à bilibili ni approuvé par bilibili. Ne téléchargez que des contenus que votre propre compte est autorisé à regarder, pour un usage personnel, en respectant les droits des créateurs et les conditions d'utilisation de bilibili.

## Fonctionnalités

### Liens pris en charge

- Vidéos (BV / av), vidéos en plusieurs parties, collections, animés et films (ep / ss / md), cours payants
- Dossiers de favoris, « À regarder plus tard », vidéos, collections et séries d'un créateur (UP 主), avec filtre par mot-clé
- Pistes audio et playlists audio (au / am), « 每周必看 » (sélection de la semaine) et classements par catégorie
- Liens courts (b23.tv et autres) et textes de partage contenant le titre
- Analyse de plusieurs liens à la fois ; chargement page par page des listes paginées (favoris, pages de créateurs)

### Qualité et formats

- Liste des qualités fournie par l'API (8K / Dolby Vision / HDR / 4K / 1080P60 / …), avec les niveaux réservés aux abonnés premium (大会员) signalés
- Priorité des codecs AVC / HEVC / AV1 ; audio jusqu'au Dolby Atmos et au FLAC sans perte Hi-Res
- Vidéo complète, audio seul ou vidéo seule ; MP4 ou MKV
- ffmpeg copie directement les flux dans le fichier final, sans réencodage

### Extras

- Couverture : enregistrée comme image et/ou intégrée au fichier
- Sous-titres CC : enregistrés en `.srt` et/ou intégrés à la vidéo
- Danmaku (commentaires défilants) en `.ass` et/ou `.xml`, avec taille de police, opacité et durée réglables
- Les segments de la barre de progression de bilibili, écrits comme de vrais chapitres
- Métadonnées NFO pour les médiathèques Kodi / Jellyfin

### File d'attente et réseau

- Téléchargements simultanés, téléchargement multithread par segments, limite de débit et nouvelle tentative automatique en cas d'erreur réseau, tous réglables
- Pause, reprise, et reprise même après un redémarrage ; les tâches impossibles à télécharger indiquent clairement pourquoi
- Proxy : direct, système ou manuel ; test de latence intégré pour choisir le nœud CDN bilibili le plus rapide
- Empêcher la mise en veille du Mac (ou de l'écran) pendant les téléchargements, et notification quand la file est terminée

### Organisation et automatisation

- Modèles de nommage avec variables (`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}`, …), segments facultatifs et niveaux de dossiers, réglables séparément pour les vidéos seules, les collections et les animés
- Détection des contenus déjà téléchargés : demander, ignorer ou retélécharger
- Abonnements : vérification périodique de favoris, collections ou créateurs, avec téléchargement automatique des nouveautés
- Historique des analyses, surveillance du presse-papiers, thème clair / sombre, exécution en arrière-plan, import / export des réglages
- Mises à jour intégrées depuis GitHub Releases, avec notes de version et possibilité d'ignorer une version

### Intégration IA

- Un serveur [MCP](https://modelcontextprotocol.io) local permet à des clients IA comme Claude d'analyser des liens, d'ajouter des téléchargements et de suivre leur progression (voir **Serveur MCP** plus bas)

## Installation

1. Téléchargez le dernier `.dmg` depuis les [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) :
   - Apple Silicon (M1 et ultérieurs) : `bili-downloader-<version>-arm64.dmg`
   - Intel : `bili-downloader-<version>-x64.dmg`
2. Ouvrez le dmg et faites glisser **B站下载器** dans **Applications**.
3. L'application est signée ad hoc mais pas notarisée, donc macOS la bloque au premier lancement. Essayez de l'ouvrir une fois, puis allez dans **Réglages Système → Confidentialité et sécurité** et cliquez sur **Ouvrir quand même**. (Depuis macOS 15, clic droit → Ouvrir ne fonctionne plus.) Vous pouvez aussi exécuter :

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

macOS 12 ou ultérieur est requis. L'interface n'existe pour l'instant qu'en chinois simplifié ; les libellés cités ci-dessous sont donnés en chinois avec leur traduction.

Une fois installée, l'application vérifie elle-même les mises à jour et peut les installer directement.

## Démarrage rapide

1. Connectez-vous à votre compte bilibili (voir **Connexion** plus bas). L'application a besoin d'un compte pour analyser les liens.
2. Copiez un lien bilibili. L'application le récupère dans le presse-papiers quand vous revenez dessus ; vous pouvez aussi appuyer sur <kbd>⌘</kbd><kbd>V</kbd> dans le champ de saisie puis cliquer sur **解析** (Analyser).
3. Choisissez les éléments à télécharger : tout sélectionner, inverser la sélection, <kbd>Maj</kbd>-clic pour une plage, ou filtrer par titre ou par numéro (par ex. `1-5,7`).
4. Choisissez la qualité, le type de sortie et les extras, puis cliquez sur **下载** (Télécharger).

Vous pouvez aussi saisir ces mots-clés à la place d'un lien : `稍后再看` ou `watchlater` (À regarder plus tard), `每周必看` (sélection de la semaine), `排行榜` (classements).

## Connexion

Une fois connecté, vous obtenez les qualités et contenus auxquels votre compte a accès (1080P et plus, contenus premium). Trois méthodes sont possibles :

- **从浏览器导入** (Importer depuis le navigateur) : réutilise les cookies de connexion de Chrome, Edge, Brave, Arc, Vivaldi, Chromium ou Firefox. macOS protège les données de Chrome, Edge et Brave : activez d'abord l'application dans **Réglages Système → Confidentialité et sécurité → Accès complet au disque**, puis redémarrez-la. L'import depuis un navigateur basé sur Chromium demande aussi l'accès au trousseau.
- **在应用内登录** (Se connecter dans l'application) : ouvre la page de connexion officielle de bilibili, avec connexion par QR code, mot de passe ou SMS.
- **手动粘贴 Cookie** (Coller les cookies) : une chaîne de cookies séparés par des points-virgules, ou le JSON exporté par une extension de navigateur.

L'application vérifie l'état de connexion au lancement, au retour sur la fenêtre, pendant l'analyse et chaque fois que l'API signale une session expirée. Si la connexion a expiré, elle vous demande de vous reconnecter, suspend la récupération des flux et reprend la file automatiquement une fois reconnecté. La déconnexion efface uniquement les cookies de l'application, sans vous déconnecter de votre navigateur.

## Serveur MCP

L'application peut lancer un serveur [Model Context Protocol](https://modelcontextprotocol.io) local pour que des clients IA puissent piloter votre file de téléchargement.

1. Allez dans **设置 → 网络与高级 → MCP 服务** (Réglages → Réseau et avancé → Serveur MCP) et activez-le.
2. Utilisez les boutons de cette même section pour copier la configuration client (JSON) ou la commande Claude Code, qui contiennent déjà votre jeton d'accès.

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

| Outil | Description |
| --- | --- |
| `get_status` | État de connexion et de l'abonnement premium (大会员), résumé de la file, espace libre du dossier de téléchargement et points à surveiller. À appeler en premier |
| `parse_link` | Analyse un lien bilibili (vidéo, collection, animé, cours, favoris, créateur…) ; les listes sont parcourues page par page automatiquement. Les identifiants des éléments sont stables ; les résultats se lisent par tranches et les vidéos en plusieurs parties peuvent être dépliées |
| `download_batch` | Ajoute tout un lien ou les éléments choisis en un seul lot et renvoie un `batch_id`. Les éléments déjà téléchargés sont ignorés par défaut, et renvoyer la même demande ne télécharge rien deux fois |
| `get_batch_status` | Avancement d'un lot : nombre de tâches par état, vitesse, temps restant estimé, qualité obtenue, causes d'échec. `wait_seconds` attend les changements |
| `list_batches` | Lots soumis récemment |
| `list_tasks` | Liste les tâches par pages, filtrées par lot, état ou titre |
| `control_tasks` | Met en pause, reprend, relance, retélécharge ou retire des tâches en masse (les fichiers téléchargés ne sont jamais supprimés) |
| `get_settings` / `update_settings` | Lit ou modifie le dossier de téléchargement, le nombre de téléchargements simultanés, les threads, la limite de débit, les nouvelles tentatives automatiques, la qualité et les options par défaut |

Le serveur n'écoute que sur `127.0.0.1` (le port est configurable), exige le jeton Bearer et vérifie les en-têtes `Host` / `Origin` pour empêcher le DNS rebinding. Vous pouvez régénérer le jeton à tout moment.

## Limitations

- Les contenus protégés par DRM, soumis à des restrictions géographiques ou que votre compte n'est pas autorisé à regarder ne peuvent pas être téléchargés. Ces tâches sont marquées **无法下载** (téléchargement impossible) avec la raison.
- macOS uniquement.

## Compiler depuis les sources

Nécessite macOS, Node.js 22.12 ou ultérieur et npm.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # mode développement
npm test             # tests unitaires
npm run typecheck    # vérification des types
npm run build:mac    # génère les dmg / zip x64 et arm64 dans dist/
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais) pour le flux de développement et [docs/RELEASING.md](docs/RELEASING.md) (en chinois) pour l'empaquetage et les publications.

## Structure du projet

```
src/main/auth               Connexion : stockage des cookies, fenêtre de connexion, import depuis le navigateur, détection d'expiration
src/main/bili               API bilibili : signature WBI, analyse des vidéos / animés / cours / listes, flux, sous-titres, danmaku
src/main/download           File de téléchargement, reprise, multiplexage ffmpeg, extras (couverture, sous-titres, NFO…)
src/main/net                Proxy et choix du CDN
src/main/update             Mises à jour intégrées : vérification de update.json, contrôle du téléchargement, remplacement du .app
src/main/mcp                Serveur MCP local
src/main/subscriptions.ts   Abonnements
src/shared                  Types, analyse des liens et modèles de nommage partagés entre les processus
src/renderer                Interface (React + Tailwind CSS + zustand)
scripts                     Récupération de ffmpeg, génération des icônes, publication des versions
```

## Contribuer

Les issues et pull requests sont les bienvenues. Merci de lire d'abord [CONTRIBUTING.md](CONTRIBUTING.md).

## Remerciements

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) pour sa documentation des API bilibili
- [FFmpeg](https://ffmpeg.org) et [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## Licence

[MIT](LICENSE) © wangzi6224

L'application intègre des binaires FFmpeg statiques issus de [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (`b6.1.1`). FFmpeg s'exécute comme un programme distinct sous sa propre licence et n'est pas couvert par la licence MIT ci-dessus. Le texte de sa licence est fourni dans l'application, dans `Contents/Resources/ffmpeg/LICENSE` ; voir aussi [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html).
