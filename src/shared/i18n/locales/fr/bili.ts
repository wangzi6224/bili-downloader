import type { Messages } from '../types'

// 解析 B站链接、取流时的报错和界面上的分组标题、音质标签
export default {
  // http.ts
  authExpired: 'La connexion a expiré, veuillez vous reconnecter',
  riskControl: 'Requête bloquée par le système anti-abus de Bilibili (HTTP 412), réessayez plus tard',
  serverError: 'Erreur du serveur Bilibili (HTTP {status})',
  networkFailed: 'Échec de la requête réseau : {error}',
  wbiKeyFailed: 'Impossible d’obtenir la clé de signature WBI',
  badResponse: 'L’API a renvoyé un contenu illisible (HTTP {status})',
  apiError: 'Erreur de l’API ({code})',

  // 解析结果里的分组标题
  groupAudioMenu: 'Playlist',
  groupCourse: 'Cours',
  groupFav: 'Dossier de favoris',
  groupSpace: 'Vidéos publiées',
  groupSeason: 'Collection',
  groupSeries: 'Série',
  groupWatchLater: 'À regarder plus tard',
  groupRank: 'Classement : {label}',
  groupMain: 'Épisodes principaux',
  groupStein: 'Segments de vidéo interactive',
  groupPages: 'Parties',
  /** 收藏夹里已失效的视频 */
  unavailable: 'Indisponible',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected:
    'Bilibili a temporairement refusé la récupération de la liste des vidéos du créateur ({error}). Réessayez plus tard, ou collez plutôt le lien d’une collection ou d’un dossier de favoris du créateur',
  weeklyNoNumber: 'Impossible d’obtenir le numéro des Incontournables de la semaine',
  captcha: 'Bilibili exige une vérification humaine, cette recherche n’a donné aucun résultat',
  unrecognized: 'Aucun lien Bilibili de vidéo, d’anime, de cours, de dossier de favoris ou de créateur reconnu',
  batchAllFailed: {
    one: 'Échec de l’analyse de {count} lien : {error}',
    other: 'Échec de l’analyse des {count} liens : {error}'
  },
  batchTitle: { one: 'Analyse groupée ({count} source)', other: 'Analyse groupée ({count} sources)' },

  // 排行榜分区（界面显示用）
  rankAll: 'Tout le site',
  rankDouga: 'Animation',
  rankMusic: 'Musique',
  rankDance: 'Danse',
  rankGame: 'Jeux vidéo',
  rankKnowledge: 'Savoir',
  rankTech: 'Technologie',
  rankSports: 'Sport',
  rankCar: 'Automobile',
  rankLife: 'Vie quotidienne',
  rankFood: 'Cuisine',
  rankAnimal: 'Animaux',
  rankKichiku: 'Kichiku (remix)',
  rankFashion: 'Mode',
  rankEnt: 'Divertissement',
  rankCinephile: 'Cinéma et séries',
  rankOrigin: 'Créations originales',
  rankRookie: 'Nouveaux créateurs',

  // 音质
  audioBest: 'Meilleure',
  audioFlac: 'Hi-Res sans perte',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'Sans perte',
  /** 任务上显示的音频画质，label 例如“320K”“无损” */
  audioQuality: 'Audio {label}',
  audioNoUrl: 'Impossible d’obtenir l’adresse de téléchargement de ce morceau',
  audioNoUrlReason: 'Impossible d’obtenir l’adresse de téléchargement de ce morceau : {reason}',

  // danmaku.ts
  danmakuHttpFailed: 'Échec du téléchargement des danmaku (HTTP {status})',

  // playurl.ts
  courseNoAccess: 'Pas d’accès à cette leçon (achat peut-être nécessaire) : {reason}',
  courseDrm: 'Cette leçon est protégée par DRM, téléchargement non pris en charge',
  coursePreview: 'Ce compte ne peut voir qu’un aperçu de cette leçon (achat nécessaire)',
  audioNotVideo: 'L’audio ne passe pas par l’API de flux vidéo',
  regionLocked: 'Restriction géographique : {reason}',
  needVip: 'Bilibili Premium requis : {reason}',
  drm: 'Ce contenu est protégé par DRM, téléchargement non pris en charge',
  previewOnly: 'Ce compte ne peut voir qu’un aperçu de ce contenu (Bilibili Premium ou achat nécessaire)',
  flvOnly: 'Cette vidéo n’existe qu’à l’ancien format FLV, pas encore pris en charge',
  noAudioTrack: 'Cette vidéo n’a pas de piste audio séparée',
  noVideoStream: 'Aucun flux vidéo disponible',
  codecFallback: '{wanted} n’est pas disponible dans cette qualité, {actual} est utilisé à la place',
  flacToMkv: 'Une piste audio Hi-Res sans perte est peu compatible avec MP4, MKV est utilisé à la place',
  /** 画质标签里“只下画面”的标记 */
  mute: 'Sans son'
} satisfies Messages['bili']
