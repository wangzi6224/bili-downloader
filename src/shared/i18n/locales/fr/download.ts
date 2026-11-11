import type { Messages } from '../types'

// 下载、合并、附加内容（封面、字幕、弹幕）相关的报错和提示
export default {
  // errors.ts：文件系统错误
  diskFull: 'Espace disque insuffisant',
  /** 拼在下面几条报错后面，指出出错的路径 */
  atPath: ' : {path}',
  noWritePermission: 'Pas d’autorisation d’écriture{where}',
  readOnlyDisk: 'Le disque de destination est en lecture seule{where}',
  dirMissing: 'Le dossier de téléchargement n’existe pas ou le disque externe est déconnecté{where}',
  writeFailed: 'Échec de l’écriture du fichier ({code}){where}',

  // extras.ts
  coverFailed: 'Échec du téléchargement de la couverture : {error}',
  noCcSubtitle: 'Pas de sous-titres CC',
  subtitleFailed: 'Échec de la récupération des sous-titres / chapitres : {error}',
  danmakuFailed: 'Échec du téléchargement des danmaku : {error}',
  coverSaveFailed: 'Échec de l’enregistrement de la couverture : {error}',
  subtitleSaveFailed: 'Échec de l’enregistrement des sous-titres : {error}',
  danmakuSaveFailed: 'Échec de l’enregistrement des danmaku : {error}',
  nfoSaveFailed: 'Échec de l’enregistrement du NFO : {error}',
  embedFallback: 'Impossible d’intégrer la couverture / les sous-titres / les chapitres à la vidéo, ils ont été enregistrés séparément',

  // fetchFile.ts
  sizeFailed: 'Impossible d’obtenir la taille du fichier (HTTP {status})',
  connectFailed: 'Échec de la connexion au serveur de téléchargement : {error}',
  timeout: 'Délai de connexion dépassé',
  httpFailed: 'Échec du téléchargement (HTTP {status})',
  badRange: 'Le serveur a renvoyé une plage de données incorrecte',
  interrupted: 'Connexion interrompue',
  incomplete: 'Fichier incomplet ({done}/{total})',

  // manager.ts
  deleteFailed: {
    one: '{count} fichier n’a pas pu être supprimé : {files}',
    other: '{count} fichiers n’ont pas pu être supprimés : {files}'
  },
  busy: 'Cette vidéo est en cours de traitement, attendez la fin',
  badRegion: 'Zone de filigrane invalide',
  fileLocked: 'La vidéo d’origine est utilisée par un autre programme et n’a pas pu être remplacée',

  // mux.ts：ffmpeg 报错，action 是下面三个之一
  actionMux: 'Fusion',
  actionWatermark: 'Suppression du filigrane',
  actionRead: 'Lecture de la vidéo',
  ffNoSpace: '{action} : échec, espace disque insuffisant',
  ffNoPermission: '{action} : échec, pas d’autorisation d’écriture dans le dossier de destination',
  ffLogoOutside: '{action} : échec, la position du filigrane sort de l’image',
  ffEncoder: '{action} : échec, encodeur indisponible',
  ffCorrupt: '{action} : échec, le fichier téléchargé est endommagé ; cliquez sur « Retélécharger »',
  ffContainer: 'Échec de la fusion : ce codec ne peut pas être placé dans le conteneur actuel ; choisissez MKV dans les réglages',
  ffExit: '{action} : échec (code de sortie ffmpeg {code}) : {detail}',
  ffSpawn: 'Impossible d’exécuter ffmpeg : {error}',
  muxTimeout: 'Délai de fusion dépassé, ffmpeg ne répond pas'
} satisfies Messages['download']
