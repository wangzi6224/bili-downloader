import type { Messages } from '../types'

export default {
  lessThanMinute: 'moins d’une minute',
  aboutMinutes: { one: 'environ {count} minute', other: 'environ {count} minutes' },
  aboutMinutesRange: 'environ {min} à {max} minutes',
  aboutHours: { one: 'environ {count} heure', other: 'environ {count} heures' },
  aboutHoursRange: 'environ {min} à {max} heures',
  estimate: 'Durée estimée : {range} · avec {device}',
  hintCpu: 'L’accélération par carte graphique n’a pas pu être utilisée sur cet ordinateur ; seul le CPU est utilisé, ce sera assez lent.',
  hintReuse: 'Les parties fixes de l’image sont reprises telles quelles (environ {pct} % des images).',
  hintFallback: 'Les traits du filigrane n’ont pas été reconnus : tout le cadre sera redessiné, le résultat peut être moins bon que prévu.',
  modelReady: 'Modèle IA prêt',
  modelVerifying: 'Vérification du modèle…',
  modelDownloading: 'Téléchargement du modèle IA {pct} % ({done} / {size})',
  modelDownloadingFrom: 'Téléchargement du modèle IA depuis {source} {pct} % ({done} / {size})',
  modelFailed: 'Échec du téléchargement du modèle : {message}',
  unknownReason: 'raison inconnue',
  modelMissing: 'L’affinage IA nécessite d’abord de télécharger le modèle ({size}, une seule fois)',
  settingsReady:
    'Téléchargé. Utilisé quand « Affinage IA » est choisi pour supprimer le filigrane ; s’il est supprimé, il faudra le retélécharger.',
  settingsReadyDisk:
    'Téléchargé, {disk} avec le cache. Utilisé quand « Affinage IA » est choisi pour supprimer le filigrane ; s’il est supprimé, il faudra le retélécharger.',
  settingsNeeded: 'Nécessaire quand « Affinage IA » est choisi pour supprimer le filigrane ; téléchargé à la première utilisation ({size}).',
  settingsNeededPartial:
    'Nécessaire quand « Affinage IA » est choisi pour supprimer le filigrane ; téléchargé à la première utilisation ({size}). La partie déjà téléchargée occupe {disk}.',
  settingsError:
    '{error}. Nécessaire quand « Affinage IA » est choisi pour supprimer le filigrane ; téléchargé à la première utilisation ({size}).',
  speedRatio: 'environ {count} fois la durée de la vidéo',
  speedRatioRange: 'environ {min} à {max} fois la durée de la vidéo',
  basisMeasured: 'mesuré sur cet ordinateur',
  basisCalibrated: 'estimé d’après un essai',
  basisRough: 'estimation approximative',
  modeOff: 'Ne pas traiter',
  modeOffHint: 'Conserve la vidéo d’origine, sans réencodage',
  modeAuto: 'Suppression rapide',
  modeAutoHint: 'Comble avec l’image environnante, zone du filigrane un peu floue',
  modeAi: 'Affinage IA',
  modeAiHint: 'Un modèle d’IA reconstitue image par image ce qui se trouve sous le filigrane, bien plus net',
  hintWithSpeed: '{hint} ; {speed}'
} satisfies Messages['aiRefine']
