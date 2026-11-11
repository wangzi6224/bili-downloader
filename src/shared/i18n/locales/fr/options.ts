import type { Messages } from '../types'

export default {
  modelMissing: '{text} ; il peut aussi être téléchargé automatiquement lors de la première suppression de filigrane',
  cancel: 'Annuler',
  retry: 'Réessayer',
  downloadModel: 'Télécharger le modèle',
  codecAvcHint: 'Meilleure compatibilité',
  codecHevcHint: 'Fichiers plus petits',
  outputFull: 'Vidéo complète',
  outputFullHint: 'Image et son réunis dans un seul fichier',
  outputAudio: 'Audio seul',
  outputAudioHint: 'Enregistre uniquement le son (m4a, ou flac pour le sans perte)',
  outputVideo: 'Vidéo seule',
  outputVideoHint: 'Enregistre uniquement l’image, sans le son',
  raisePriority: 'Augmenter la priorité',
  codecFallback: '{wanted} n’est pas disponible dans cette qualité, {actual} sera téléchargé',
  content: 'Contenu à télécharger',
  noAudioTrack: 'Cette vidéo n’a pas de piste audio séparée',
  codecOrder: 'Priorité des codecs',
  audio: 'Qualité audio',
  audioUnavailable: ' (indisponible pour cette vidéo)',
  audioHint:
    '« Meilleure » : pour une vidéo complète, Dolby en priorité (sans perte en priorité avec MKV) ; pour l’audio seul, sans perte en priorité. Si la qualité choisie n’est pas disponible, la suivante en dessous est utilisée',
  container: 'Conteneur',
  mp4Hint: 'Lisible directement dans QuickTime et sur iPhone',
  mkvHint: 'Accepte les pistes audio sans perte, meilleure compatibilité avec les sous-titres et Dolby Vision',
  watermark: 'Filigrane',
  watermarkAutoHint:
    'Ne s’applique que si un filigrane est détecté. La vidéo doit être réencodée, ce qui est nettement plus lent qu’un simple téléchargement ; en cas de réussite, seule la version sans filigrane est conservée. Les vidéos HDR et Dolby Vision ne sont pas traitées.',
  watermarkAiHint:
    'Ne s’applique que si un filigrane est détecté. Un modèle d’IA reconstitue image par image ce qui se trouve sous le filigrane : bien plus net que la suppression rapide, mais beaucoup plus lent (environ 2 à 4 fois la durée de la vidéo avec une carte graphique, davantage sans). Si le modèle ne peut pas être téléchargé ou si l’affinage échoue, la suppression rapide est utilisée cette fois-ci. Les vidéos HDR et Dolby Vision ne sont pas traitées.',
  extras: 'Contenu supplémentaire',
  embedCover: 'Intégrer la couverture au fichier',
  cover: 'Enregistrer la couverture en image',
  embedSubtitle: 'Intégrer les sous-titres à la vidéo',
  subtitle: 'Enregistrer les sous-titres en .srt',
  chapters: 'Chapitres (segments de la barre de progression)',
  nfo: 'Métadonnées NFO',
  danmaku: 'Danmaku',
  danmakuAss: 'ASS (superposés dans le lecteur)',
  danmakuXml: 'XML (brut)',
  nfoHint: 'Génère des fichiers .nfo reconnus par Kodi / Jellyfin / Emby ; pour les anime, génère aussi tvshow.nfo et une affiche'
} satisfies Messages['options']
