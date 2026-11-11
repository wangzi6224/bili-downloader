import type { Messages } from '../types'

// MCP 去水印：耗时估算的说法、批次里的水印提示、remove_watermark 的结果
export default {
  // 时长区间，{count} 是单个值，{lo}～{hi} 是区间
  secOne: { one: 'environ {count} seconde', other: 'environ {count} secondes' },
  secRange: 'environ {lo} à {hi} secondes',
  minOne: { one: 'environ {count} minute', other: 'environ {count} minutes' },
  minRange: 'environ {lo} à {hi} minutes',
  hourOne: { one: 'environ {count} heure', other: 'environ {count} heures' },
  hourRange: 'environ {lo} à {hi} heures',
  // 耗时是视频时长的几倍
  ratioOne: 'environ {count} fois',
  ratioRange: 'environ {lo} à {hi} fois',

  basisMeasured: 'd’après la vitesse réelle de traitement sur cet ordinateur',
  basisCalibrated: 'd’après la vitesse d’un essai',
  basisDefault: 'aucun traitement encore fait sur cet ordinateur, estimation approximative',

  modelNote: 'la première utilisation nécessite de télécharger un modèle IA d’environ {size} Mo',
  fastChoice: 'suppression rapide, {time} (comble avec l’image environnante, zone du filigrane un peu floue)',
  fastChoiceNoTime: 'suppression rapide (comble avec l’image environnante, zone du filigrane un peu floue)',
  aiChoice: 'affinage IA, {time} (reconstitue image par image ce qui se trouve sous le filigrane, bien plus net{model})',
  aiChoiceNoTime: 'affinage IA (reconstitue image par image ce qui se trouve sous le filigrane, bien plus net{model})',
  /** 接在 aiChoice 的括号里，{model} 为空时不出现 */
  aiChoiceModel: ' ; {note}',
  choices: '{fast}, {ai}',

  processing:
    'Suppression du filigrane en cours ; vous pouvez attendre avec wait_seconds. Une fois le traitement terminé, watermark.removed de la tâche vaut true',
  pending: {
    one:
      '{count} vidéo téléchargée porte un filigrane Bilibili : demandez d’abord à l’utilisateur s’il veut le supprimer, au choix : {choices}. ' +
      'La suppression réencode la vidéo et remplace le fichier d’origine ; après accord de l’utilisateur, appelez remove_watermark batch_id={id} method=fast ou method=ai',
    other:
      '{count} vidéos téléchargées portent un filigrane Bilibili : demandez d’abord à l’utilisateur s’il veut le supprimer, au choix : {choices}. ' +
      'La suppression réencode les vidéos et remplace les fichiers d’origine ; après accord de l’utilisateur, appelez remove_watermark batch_id={id} method=fast ou method=ai'
  },
  willDetect: 'La présence d’un filigrane Bilibili sera détectée pour chaque vidéo au téléchargement ; le résultat apparaîtra ici',
  plannedOff:
    'La présence d’un filigrane Bilibili sera détectée au téléchargement, consultable avec get_batch_status ; s’il y en a, vous pouvez demander à l’utilisateur s’il veut le supprimer avec remove_watermark',
  plannedOn: 'Les vidéos où un filigrane Bilibili est détecté en seront débarrassées après téléchargement, avec réencodage',
  plannedKnown: 'Suppression du filigrane des vidéos de durée connue : {time} au total ({basis})',
  plannedAll: 'Suppression du filigrane de toutes les vidéos : {time} au total ({basis})',
  plannedModel: '{model} ; s’il ne peut pas être téléchargé, la suppression rapide est utilisée',
  speed: '{ratio} ({basis})',
  speedBackend: '{ratio} ({basis}, {backend})',

  regionInvalid: 'region doit être de la forme {x, y, w, h}, en pixels de la vidéo',
  regionOneTask: 'region ne peut être utilisé qu’avec une seule tâche : la position et la taille du filigrane peuvent varier d’une vidéo à l’autre',
  tooManyTasks: '{max} tâches au maximum par appel',
  busy: 'Traitement en cours, attendez la fin',
  tooManyInspect: 'Trop de vidéos à analyser cette fois ({max} au maximum par appel) ; appelez à nouveau pour les restantes',
  alreadyRemoved:
    'Le filigrane a déjà été supprimé ; pour retraiter avec une autre méthode (par exemple passer à l’affinage IA après une suppression rapide), passez force=true',
  regionOutside: 'region est hors de l’image ou trop petite (dimensions de la vidéo : {size})',
  unsure: 'Présence d’un filigrane Bilibili incertaine ; si vous confirmez qu’il y en a un, indiquez sa position avec region (suggested_region peut servir)',
  noRegion: 'Position du filigrane non reconnue ; si vous confirmez qu’il y en a un, indiquez sa position avec region (coordonnées en pixels)',
  total: '{time} au total ({basis})',
  aiFallback:
    '{model} ; s’il ne peut pas être téléchargé ou si l’affinage échoue, la suppression rapide est utilisée cette fois-ci, et le champ note de la tâche l’indiquera',
  dryRun: 'Ceci est une estimation, aucun traitement n’a été lancé ; après accord de l’utilisateur, appelez à nouveau sans dry_run',
  started:
    'La vidéo d’origine reste inchangée pendant le traitement et sera remplacée à la fin ; consultez watermark.processing avec get_batch_status ou list_tasks, et annulez avec control_tasks action=cancel_watermark',
  noneSkipped: 'Aucune vidéo à traiter, voir skipped pour les raisons',
  noneEligible:
    'Aucune vidéo à traiter : avec batch_id, seules les vidéos entièrement téléchargées, avec un filigrane détecté et pas encore supprimé sont traitées ; pour les autres, indiquez-les avec task_ids',
  targetsMissing: 'Indiquez les vidéos à traiter avec task_ids ou batch_id'
} satisfies Messages['mcpWm']
