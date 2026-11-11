import type { Messages } from '../types'

// 去水印（快速去除、AI 精修）相关的报错和任务提示
export default {
  // shared/watermark.ts：水印在画面的哪个角（只用在“dans le {corner}”里）
  cornerTopLeft: 'coin supérieur gauche',
  cornerTopRight: 'coin supérieur droit',
  cornerBottomLeft: 'coin inférieur gauche',
  cornerBottomRight: 'coin inférieur droit',

  // 任务提示（会存进 tasks.json）
  noteNone:
    'Suppression du filigrane : aucun filigrane détecté, la vidéo d’origine est conservée (vous pouvez cliquer sur « Supprimer le filigrane… » sur la tâche pour l’encadrer manuellement)',
  noteStatic:
    'Suppression du filigrane : l’image varie trop peu pour une détection automatique, la vidéo d’origine est conservée (vous pouvez cliquer sur « Supprimer le filigrane… » sur la tâche pour l’encadrer manuellement)',
  noteFewFrames:
    'Suppression du filigrane : vidéo trop courte ou image trop sombre pour une détection automatique, la vidéo d’origine est conservée (vous pouvez cliquer sur « Supprimer le filigrane… » sur la tâche pour l’encadrer manuellement)',
  noteHdr: 'Suppression du filigrane : les vidéos HDR et Dolby Vision ne sont pas encore prises en charge, la vidéo d’origine est conservée',
  noteInterrupted: 'Suppression du filigrane inachevée (l’application a été quittée en cours de route), la vidéo d’origine est conservée',
  noteMoved: 'Suppression du filigrane inachevée : la vidéo d’origine a été déplacée ou supprimée pendant le traitement',
  noteFailed: 'Échec de la suppression du filigrane : {reason}, la vidéo d’origine est conservée',
  /** reason 本身已经是“去水印失败：…”“去水印超时：…”这样的完整说明 */
  noteFailedWhole: '{reason}, la vidéo d’origine est conservée',
  noteAiFallback:
    'Suppression du filigrane : le modèle IA n’a pas pu être téléchargé ({reason}), la suppression rapide a été utilisée cette fois-ci',
  noteAiFailed:
    'Suppression du filigrane : l’affinage IA n’a pas pu aboutir ({reason}), la suppression rapide a été utilisée cette fois-ci',

  // 识别、处理
  modelNotDone: 'Téléchargement inachevé',
  noVideoFrame: 'Aucune image vidéo trouvée',
  noVideoInFile: 'Le fichier ne contient pas d’image vidéo',
  hdrUnsupported: 'Les vidéos HDR et Dolby Vision ne sont pas encore prises en charge',
  regionTooSmall: 'Zone du filigrane trop petite',
  taskMissing: 'La tâche n’existe pas',
  notDone: 'Seules les vidéos entièrement téléchargées peuvent être traitées',
  audioOnly: 'Cette tâche ne contient que de l’audio, sans image',
  fileMissing: 'Fichier vidéo introuvable, il a peut-être été déplacé ou supprimé',
  grabFailed: 'Impossible d’extraire une image de la vidéo',
  previewFailed: 'Impossible de générer l’aperçu',
  probeFailed: 'Impossible de lire les informations de la vidéo',
  probeFailedNoFile: 'Impossible de lire les informations de la vidéo : le fichier n’existe pas',
  ffNoResponse: 'ffmpeg ne répond pas',
  ffTooMuchOutput: 'ffmpeg a produit plus de données que prévu',
  ffStalled: 'Délai dépassé pour la suppression du filigrane : ffmpeg ne progresse plus depuis longtemps',
  stalled: 'Délai dépassé pour la suppression du filigrane : aucune progression depuis longtemps',
  encoderExited: 'Le processus d’encodage s’est arrêté',

  // AI 精修
  backendCoreml: 'Neural Engine d’Apple',
  /** 推理子进程在系统任务管理器里的名字 */
  hostServiceName: 'Suppression de filigrane IA',
  badInference: 'Résultat d’inférence anormal',
  noAiBackend: 'Aucun moyen d’inférence IA disponible ({errors})',
  modelNotLoaded: 'Le modèle n’est pas encore chargé',
  modelNoImage: 'Le modèle n’a produit aucune image',
  hostExited: 'Le processus d’inférence s’est arrêté de façon inattendue (code {code})',
  exitCodeUnknown: 'inconnu',
  loadTimeout: 'Délai dépassé pour le chargement du modèle',
  inferTimeout: 'Délai d’inférence dépassé',
  modelUnreachable:
    'Impossible de joindre l’adresse de téléchargement du modèle ({names}). Vérifiez le réseau ou configurez un proxy dans les réglages',
  modelChecksum: 'La vérification du fichier de modèle téléchargé a échoué, veuillez réessayer',
  modelMissing: 'Le modèle IA n’est pas encore téléchargé',
  modelIncomplete: 'Fichier de modèle incomplet',
  modelBadFormat: 'Format du fichier de modèle incorrect',
  modelBadSize: 'Dimensions du modèle invalides',
  modelNoGraph: 'Le fichier de modèle ne contient pas de graphe de calcul',
  modelInputNotImage: 'L’entrée du modèle n’est pas une image',
  maskSize: 'Dimensions du masque incorrectes',
  outputSize: 'Dimensions de sortie du modèle incorrectes'
} satisfies Messages['wm']
