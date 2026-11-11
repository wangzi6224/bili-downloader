import type { Messages } from '../types'

// MCP 下载、批次、设置类工具：工具说明、参数说明和返回给 AI 的提示
export default {
  qn: 'Code de qualité ; la meilleure qualité disponible qui ne le dépasse pas est choisie : 127 meilleure disponible, 120 4K, 116 1080P60, 112 1080P+, 80 1080P, 64 720P, 32 480P, 16 360P',

  // 下载选项（options / defaults 的字段）
  optOutput: 'Vidéo complète / audio seul / vidéo seule (sans son)',
  optContainer: 'Conteneur vidéo',
  optAudio: 'Qualité audio : best choisit automatiquement la meilleure ; si la qualité demandée n’est pas disponible, la suivante en dessous est utilisée',
  optCodecOrder: 'Priorité des codecs vidéo, par exemple ["hevc","avc","av1"]',
  optSubtitle: 'Enregistrer les sous-titres en .srt',
  optEmbedSubtitle: 'Intégrer les sous-titres au fichier vidéo',
  optDanmaku: 'Télécharger les danmaku',
  optDanmakuFormat: 'Format des danmaku',
  optCover: 'Enregistrer la couverture en image',
  optEmbedCover: 'Intégrer la couverture au fichier vidéo / audio',
  optChapters: 'Enregistrer les segments de la barre de progression comme chapitres',
  optNfo: 'Générer des métadonnées NFO pour Kodi / Jellyfin',
  optWatermark:
    'Suppression du filigrane : après le téléchargement, détecte automatiquement le filigrane dans un coin de l’image et le supprime (la vidéo doit être réencodée ; la vidéo d’origine est conservée si aucun filigrane n’est détecté, ou pour le HDR et le Dolby Vision). ' +
    'auto : suppression rapide (comblement par interpolation, en quelques minutes, zone du filigrane un peu floue) ; ai : un modèle d’IA répare image par image, bien plus net mais beaucoup plus lent ' +
    '(environ 2 à 4 fois la durée de la vidéo avec une carte graphique, davantage sans ; la première fois, un modèle d’environ 200 Mo est téléchargé, et la suppression rapide est utilisée s’il ne peut pas l’être). ' +
    'Avec off, la présence d’un filigrane est quand même détectée ; le résultat figure dans le champ watermark de get_batch_status, et remove_watermark permet ensuite de le supprimer. Inutile de le passer si l’utilisateur n’a pas parlé de filigrane',

  getStatusTitle: 'État de l’application',
  getStatusDesc:
    'État de connexion et de Bilibili Premium, résumé de la file de téléchargement, débit total, dossier de téléchargement et espace libre, principaux réglages, et points d’attention. À appeler en premier.',

  parseLinkTitle: 'Analyser un lien',
  parseLinkDesc:
    'Analyse un lien Bilibili (vidéo, collection, anime, cours, dossier de favoris, page de créateur, À regarder plus tard, etc.) ; les listes paginées sont parcourues automatiquement. ' +
    'Quand il y a beaucoup d’éléments, lisez-les par tranches avec offset / limit ; le résultat est mis en cache 10 minutes. Les id des éléments sont stables et se passent dans ids de download_batch. ' +
    'Les parties des vidéos d’une liste (lazy) ne sont pas encore développées : elles le sont automatiquement à l’ajout au téléchargement ; passez expand_parts pour voir les parties ou n’en télécharger que certaines. ' +
    "Pour une vidéo lazy, downloaded='partly' signifie qu’au moins une partie a déjà été téléchargée ; chaque partie est vérifiée à l’ajout au téléchargement.",
  parseLinkUrl:
    'Lien Bilibili, identifiant BV, ou l’un des mots-clés « 稍后再看 » (À regarder plus tard), « 每周必看 » (Incontournables de la semaine), « 排行榜 » (classement)',
  parseLinkMaxItems: 'Nombre maximal d’éléments à récupérer en parcourant les pages, {n} par défaut',
  parseLinkOffset: 'Position du premier élément renvoyé, 0 par défaut',
  parseLinkLimit: 'Nombre d’éléments renvoyés, 100 par défaut',
  parseLinkExpand: 'Développer les parties des vidéos de liste renvoyées cette fois (une requête par vidéo, plus lent) ; limit est alors de {n} au maximum',
  parseLinkRefresh: 'Ignorer le cache et analyser à nouveau',

  downloadTitle: 'Téléchargement par lot',
  downloadDesc:
    'Ajoute les éléments d’un lien à la file de téléchargement sous forme d’un lot et renvoie immédiatement un batch_id ; les parties des vidéos de liste sont développées en arrière-plan. ' +
    'Choisissez les éléments avec ids, ou all=true pour tout télécharger ; pour le lien d’une seule vidéo, aucun des deux n’est nécessaire. ' +
    'Si les vidéos viennent de liens différents (par exemple des résultats de recherche), soumettez-les en une fois avec videos, et non une par une. Les éléments déjà téléchargés sont ignorés par défaut, ceux déjà dans la file ne sont pas ajoutés deux fois. ' +
    'Tant que le lot d’origine n’est pas terminé, soumettre la même requête renvoie ce lot (deduplicated=true) ; passez request_id pour fixer explicitement la clé d’idempotence.',
  downloadUrl: 'Le même lien que pour parse_link. Ne peut pas être utilisé avec videos',
  downloadVideos:
    'Identifiants BV, identifiants av, liens de vidéos ou liens courts b23.tv (par exemple les url des résultats de search_videos), réunis en un seul lot, {max} au maximum, dont 20 liens courts et identifiants av au maximum. Toutes les parties de chaque vidéo sont téléchargées, le paramètre p du lien est ignoré ; pour les listes comme les collections ou les dossiers de favoris, utilisez url',
  downloadBatchTitle:
    'Nom du lot pour videos, qui sert aussi de nom de dossier quand il y a plusieurs vidéos. Par défaut : le titre de la vidéo s’il n’y en a qu’une, « N vidéos » sinon',
  downloadIds: 'id d’éléments renvoyés par parse_link (l’id d’une vidéo désigne toutes ses parties)',
  downloadAll: 'Télécharger tous les éléments (max_items au maximum)',
  downloadMaxItems: 'Nombre maximal d’éléments avec all=true, {n} par défaut ; si la valeur est la même que pour parse_link, son cache est réutilisé',
  downloadQn: '{qn}. Par défaut, la qualité des réglages',
  downloadOptions: 'Options de téléchargement ; celles non fournies prennent les valeurs par défaut des réglages',
  downloadSubdir: 'Enregistrer dans ce sous-dossier du dossier de téléchargement',
  downloadSkip: 'Ignorer les éléments déjà présents dans l’historique des téléchargements, true par défaut',
  downloadRequestId: 'Clé d’idempotence : un même request_id ne crée qu’un seul lot',

  batchStatusTitle: 'Progression du lot',
  batchStatusDesc:
    'Progression d’un lot : nombre de tâches par état, octets téléchargés, débit, temps restant estimé, qualité réelle, raisons des échecs et conseils pour la suite. ' +
    'watermark décrit la suppression du filigrane : nombre de vidéos où un filigrane Bilibili a été détecté, nombre de filigranes supprimés, progression du traitement en cours et, s’il reste des filigranes, durée de chacune des deux méthodes (hint contient la formulation à donner à l’utilisateur). ' +
    'Avec wait_seconds supérieur à 0, la réponse n’arrive que lorsque le lot est entièrement terminé, en pause ou demande une intervention (attente maximale de cette durée), y compris pendant la suppression du filigrane ; plus simple que d’interroger à répétition.',
  batchStatusWait: 'Durée d’attente maximale en secondes, 0 par défaut',
  batchStatusInclude:
    'Détails à joindre : failed liste des échecs (par défaut), files chemins des fichiers terminés, running tâches en cours de téléchargement',

  listBatchesTitle: 'Lots récents',
  listBatchesDesc: 'Lots soumis récemment (les plus récents en premier), pour retrouver un batch_id.',
  listBatchesLimit: '20 par défaut',

  listTasksTitle: 'Liste des tâches',
  listTasksDesc:
    'Liste paginée des tâches de téléchargement, filtrable par lot, état ou titre. États : queued en file d’attente, running en téléchargement, paused en pause, retrying en attente de nouvelle tentative automatique, ' +
    'failed en échec, unsupported impossible à télécharger, waiting_auth en attente de connexion, done terminée ; active désigne celles qui ne sont pas terminées.',
  listTasksStatus: 'Un ou plusieurs états, all par défaut',
  listTasksQuery: 'Texte contenu dans le titre',
  listTasksLimit: '50 par défaut',
  listTasksFields: 'Ne renvoyer que ces champs',

  controlTitle: 'Contrôle groupé des tâches',
  controlDesc:
    'Met en pause, reprend, réessaie, retélécharge ou retire des tâches en groupe, ou annule une suppression de filigrane. Définissez la portée avec task_ids, batch_id, status (au moins un, combinables). ' +
    'Avec seulement batch_id (sans task_ids ni status), l’action porte sur tout le lot : pause / resume s’appliquent aussi aux tâches ajoutées à la file plus tard, retry réessaie aussi les éléments dont le développement des parties a échoué, remove n’ajoute plus les éléments pas encore traités. ' +
    'redownload supprime la partie téléchargée et recommence depuis le début ; remove annule les tâches inachevées et les retire de la liste, sans supprimer les fichiers déjà téléchargés ; ' +
    'cancel_watermark annule une suppression de filigrane en cours (lancée par remove_watermark), la vidéo d’origine reste intacte.',
  controlStatus: 'N’agir que sur les tâches dans ces états',
  controlUnsupported: 'Avec retry, réessayer aussi les tâches « impossibles à télécharger » (par exemple après avoir souscrit à Bilibili Premium)',

  removeWmTitle: 'Supprimer le filigrane',
  removeWmDesc:
    'Supprime le filigrane Bilibili dans un coin de l’image des vidéos téléchargées, en arrière-plan, puis remplace le fichier d’origine (réencodage). À n’appeler que si l’utilisateur l’a explicitement demandé ou accepté. ' +
    'method=fast suppression rapide : comble avec l’image environnante, zone du filigrane un peu floue, prend généralement une fraction de la durée de la vidéo ; ' +
    'method=ai affinage IA : reconstitue image par image ce qui se trouve sous le filigrane, bien plus net mais beaucoup plus lent (environ 2 à 4 fois la durée de la vidéo avec une carte graphique) ; la première fois, un modèle d’environ 200 Mo est téléchargé, et la suppression rapide est utilisée s’il ne peut pas l’être ou si l’affinage échoue. ' +
    'Avec batch_id, traite les vidéos du lot entièrement téléchargées, avec un filigrane détecté et pas encore supprimé ; avec task_ids, détecte vidéo par vidéo (quelques secondes pour chaque vidéo non analysée au téléchargement, 10 au maximum par appel). ' +
    'Appelez d’abord avec dry_run=true pour obtenir la durée estimée de chaque vidéo, informez l’utilisateur, puis lancez l’appel réel. Suivez la progression dans le champ watermark de get_batch_status ou list_tasks ; annulez avec control_tasks action=cancel_watermark.',
  removeWmMethod: 'fast suppression rapide ; ai affinage IA',
  removeWmTaskIds: 'Tâches à traiter (obligatoirement terminées)',
  removeWmBatchId: 'Traiter les vidéos de ce lot avec un filigrane détecté et pas encore supprimé',
  removeWmRegion:
    'Position du filigrane indiquée manuellement (coordonnées en pixels de la vidéo), uniquement avec un seul task_id ; si la position n’est pas reconnue, skipped indique les dimensions de la vidéo et la position probable',
  removeWmForce: 'Retraiter aussi les vidéos dont le filigrane a déjà été supprimé (par exemple passer à l’affinage IA après une suppression rapide)',
  removeWmDryRun: 'Seulement détecter et estimer la durée, sans lancer le traitement',

  getSettingsTitle: 'Lire les réglages',
  getSettingsDesc:
    'Lit les réglages liés au téléchargement : dossier de téléchargement, nombre de téléchargements simultanés, nombre de connexions par fichier, limite de débit, nombre de nouvelles tentatives automatiques, qualité par défaut et options de téléchargement par défaut.',

  updateSettingsTitle: 'Modifier les réglages',
  updateSettingsDesc:
    'Modifie les réglages liés au téléchargement ; ne passez que ceux à changer. Renvoie les réglages modifiés et le moment où chacun prend effet.',
  updateDownloadDir: 'Chemin absolu (peut commencer par ~/), créé s’il n’existe pas',
  updateConcurrency: 'Nombre de tâches téléchargées simultanément',
  updateThreads: 'Nombre de connexions ouvertes en parallèle par fichier pour le téléchargement segmenté',
  updateSpeedLimit: 'Limite de débit globale en Ko/s, 0 = illimité',
  updateAutoRetry: 'Nombre de nouvelles tentatives automatiques en cas d’erreur réseau',
  updateDefaults: 'Options de téléchargement par défaut ; seuls les champs fournis sont modifiés',

  // 调用结果
  noSuchTool: 'Outil introuvable : {name}',
  noSuchToolHint: 'Utilisez tools/list pour voir les outils disponibles',
  downloadDirAbsolute: 'download_dir doit être un chemin absolu',
  downloadDirUnusable: 'Dossier de téléchargement inutilisable : {reason}',
  effectDownloadDir: 'Ne concerne que les tâches ajoutées ensuite ; celles déjà dans la file sont toujours enregistrées dans l’ancien dossier',
  effectConcurrency:
    'Effet immédiat : en augmentant, les tâches en attente démarrent tout de suite ; en diminuant, les téléchargements en cours ne sont pas interrompus',
  effectThreads:
    'Les téléchargements en cours ne sont pas affectés ; les tâches qui démarrent ensuite ou reprennent après une pause utilisent la nouvelle valeur',
  effectNow: 'Effet immédiat',
  effectLater: 'Ne concerne que les tâches ajoutées ensuite',
  notVip:
    'Pas de Bilibili Premium : les qualités réservées comme la 4K ou le 1080P haut débit sont inaccessibles, la meilleure qualité téléchargeable est choisie automatiquement',
  appNotLoggedIn: 'L’application n’est pas connectée : l’analyse des liens nécessite une connexion. {loginHint}',
  loginUnknown: 'Impossible de confirmer l’état de connexion pour le moment (problème réseau possible)',
  waitingAuth: {
    one: '{count} tâche attend la connexion ; elle reprendra automatiquement après reconnexion. {loginHint}',
    other: '{count} tâches attendent la connexion ; elles reprendront automatiquement après reconnexion. {loginHint}'
  },
  paused: {
    one: '{count} tâche est en pause (les tâches inachevées sont mises en pause automatiquement au redémarrage de l’application) ; vous pouvez la reprendre avec control_tasks action=resume',
    other: '{count} tâches sont en pause (les tâches inachevées sont mises en pause automatiquement au redémarrage de l’application) ; vous pouvez les reprendre avec control_tasks action=resume'
  },
  failed: {
    one: '{count} tâche a échoué ; vous pouvez la réessayer avec control_tasks action=retry status=failed',
    other: '{count} tâches ont échoué ; vous pouvez les réessayer avec control_tasks action=retry status=failed'
  },
  lowSpace: 'Il reste moins de 5 Go d’espace libre sur le disque du dossier de téléchargement',
  pageError: {
    one: 'Erreur lors du changement de page ({error}), seul {count} élément a été obtenu ; réessayez un peu plus tard avec refresh=true',
    other: 'Erreur lors du changement de page ({error}), seuls les {count} premiers éléments ont été obtenus ; réessayez un peu plus tard avec refresh=true'
  },
  truncated: {
    one: 'Seul {count} élément a été récupéré ; pour en avoir plus, augmentez max_items ({max} au maximum)',
    other: 'Seuls les {count} premiers éléments ont été récupérés ; pour en avoir plus, augmentez max_items ({max} au maximum)'
  },
  moreItems: 'Il reste des éléments non renvoyés ; continuez avec offset={next}',
  lazyItems: 'Les éléments lazy sont des vidéos dont les parties ne sont pas encore développées ; elles le seront automatiquement à l’ajout au téléchargement',
  dupResumed: 'La même requête a déjà été soumise ; les éléments qui n’avaient pas été ajoutés à la file la dernière fois sont en cours de traitement',
  dupSame:
    'La même requête a déjà été soumise, rien n’a été ajouté en double ; consultez la progression avec get_batch_status batch_id={id}. Pour soumettre à nouveau, utilisez un autre request_id',
  videosWith: 'videos et {key} ne peuvent pas être utilisés ensemble',
  videosEmpty: 'videos ne peut pas être vide',
  videosTooMany: 'videos accepte {max} éléments au maximum par appel ; répartissez-les en plusieurs lots',
  titleTooLong: 'title ne peut pas dépasser {max} caractères',
  videosNone:
    'videos ne contient aucune vidéo téléchargeable (par exemple {examples}) ; pour les listes comme les collections ou les dossiers de favoris, utilisez url',
  videosTitle: { one: '{count} vidéo', other: '{count} vidéos' },
  checkProgress: 'Consultez la progression avec get_batch_status batch_id={id} wait_seconds=30',
  rejected: {
    one: '{count} élément ne correspond à aucune vidéo et a été ignoré, voir rejected',
    other: '{count} éléments ne correspondent à aucune vidéo et ont été ignorés, voir rejected'
  },
  idsAndAll: 'ids et all ne peuvent pas être utilisés ensemble',
  idsNone: 'Aucun des ids ne figure dans ce lien (par exemple {examples}) ; consultez d’abord les id des éléments avec parse_link',
  pagedList: 'Cette liste contient {total} éléments ; passez all=true pour tout télécharger, ou choisissez des éléments avec ids',
  unknownIds: {
    one: '{count} id ne figure pas dans ce lien et a été ignoré',
    other: '{count} id ne figurent pas dans ce lien et ont été ignorés'
  },
  addPageError: {
    one: 'Erreur lors du changement de page ({error}), seul {count} élément a été ajouté ; soumettez à nouveau un peu plus tard pour ajouter la suite',
    other: 'Erreur lors du changement de page ({error}), seuls les {count} premiers éléments ont été ajoutés ; soumettez à nouveau un peu plus tard pour ajouter la suite'
  },
  addTruncated: {
    one: 'Seul {count} élément a été récupéré, la suite n’a pas été ajoutée ; pour en avoir plus, augmentez max_items ({max} au maximum)',
    other: 'Seuls les {count} premiers éléments ont été récupérés, la suite n’a pas été ajoutée ; pour en avoir plus, augmentez max_items ({max} au maximum)'
  },
  allDownloaded: 'Tous les éléments sélectionnés ont déjà été téléchargés ; pour les retélécharger, passez skip_downloaded=false',
  nothingToDownload: 'Aucun élément téléchargeable',
  controlScope: 'Indiquez les tâches concernées avec task_ids, batch_id ou status',
  notWatermarking: 'Aucune suppression de filigrane en cours',
  wrongStatus: 'Impossible d’appliquer {action} à une tâche à l’état {status}',
  taskIdsAndBatch: 'task_ids et batch_id ne peuvent pas être utilisés ensemble',
  nothingToUpdate: 'Aucun réglage à modifier ; réglages modifiables : {names}'
} satisfies Messages['mcpTools']
