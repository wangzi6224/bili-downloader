import type { Messages } from '../types'

export default {
  methodFast: 'Rapide',
  methodFastHint: 'Comble avec l’image environnante, en quelques minutes ; la zone du filigrane sera un peu floue',
  methodAi: 'Affinage IA',
  methodAiHint: 'Un modèle d’IA reconstitue image par image ce qui se trouve sous le filigrane : bien plus net, mais lent',
  title: 'Supprimer le filigrane',
  subtitle:
    'Faites glisser le cadre sur le filigrane ; tirez sur les coins et les bords pour le redimensionner. La vidéo est réencodée pendant le traitement, puis remplace le fichier d’origine.',
  alreadyApplied:
    'Le filigrane de cette vidéo a déjà été supprimé une fois. Un nouveau traitement la réencodera encore, avec une légère perte de qualité.',
  detected: 'Filigrane détecté dans le {corner}, vous pouvez encore ajuster le cadre.',
  notDetected: 'Aucun filigrane détecté automatiquement. Faites glisser le cadre sur le filigrane.',
  frameAlt: 'Image de la vidéo',
  regionLabel: 'Zone du filigrane : touches fléchées pour déplacer, Maj enfoncée pour 10 pixels à la fois',
  detecting: 'Détection du filigrane…',
  nextFrame: 'Autre image',
  showOriginal: 'Voir l’original',
  preview: 'Aperçu du résultat',
  reset: 'Réinitialiser',
  cancel: 'Annuler',
  retry: 'Réessayer',
  downloadModel: 'Télécharger le modèle',
  estimating: 'Estimation de la durée (la première fois, il faut charger le modèle et tester quelques images, une dizaine de secondes)…',
  startAi: 'Lancer l’affinage IA',
  start: 'Lancer le traitement'
} satisfies Messages['wmDialog']
