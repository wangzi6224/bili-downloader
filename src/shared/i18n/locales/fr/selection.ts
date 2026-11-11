import type { Messages } from '../types'

export default {
  qualityBest: 'Meilleure disponible',
  quality1080: '1080P HD',
  quality720: '720P',
  quality480: '480P SD',
  kindUgc: 'Vidéo',
  kindPgc: 'Anime / films et séries',
  kindCheese: 'Cours',
  kindAudio: 'Audio',
  sources: { one: '{count} source', other: '{count} sources' },
  loadedOf: '{count} / {total} éléments chargés',
  totalItems: { one: '{count} élément', other: '{count} éléments au total' },
  downloadedBefore: { one: '{count} élément déjà téléchargé', other: '{count} éléments déjà téléchargés' },
  close: 'Fermer',
  selectAllFiltered: 'Sélectionner les résultats filtrés',
  selectAll: 'Tout sélectionner',
  selectNone: 'Tout désélectionner',
  invert: 'Inverser la sélection',
  deselectDownloaded: 'Désélectionner les éléments téléchargés',
  filterPlaceholder: 'Filtrer par titre / créateur',
  rangePlaceholder: 'Numéros, ex. 1-5,7',
  rangeTitle: 'Sélectionner par numéro, valider avec Entrée',
  selectedCount: {
    one: 'Maj pour une sélection continue · {count} sélectionné',
    other: 'Maj pour une sélection continue · {count} sélectionnés'
  },
  groupLoaded: '{count} / {total} chargés',
  downloadedTitle: 'Cet élément figure dans l’historique des téléchargements',
  downloaded: 'Téléchargé',
  needVip: 'Premium requis',
  loadingPage: 'Chargement de la page {page}…',
  stop: 'Arrêter',
  loadNext: 'Charger la page suivante',
  loadAllTitle: 'Une seconde d’intervalle entre chaque page, pour ne pas déclencher le système anti-abus',
  loadAll: {
    one: 'Tout charger ({count} élément restant)',
    other: 'Tout charger ({count} éléments restants)'
  },
  quality: 'Qualité',
  fetchingQualities: 'Récupération des qualités disponibles…',
  vip: 'Premium',
  audioOnlyHint:
    'Pour le contenu de la section audio, seul l’audio est téléchargé ; le sans perte nécessite Bilibili Premium, sinon la qualité inférieure est utilisée automatiquement.',
  fetchingParts: 'Récupération des parties des vidéos {done}/{total}…',
  dupPrompt: {
    one: '{count} des éléments sélectionnés a déjà été téléchargé',
    other: '{count} des éléments sélectionnés ont déjà été téléchargés'
  },
  skipThem: 'Les ignorer',
  downloadAnyway: 'Télécharger quand même',
  downloadCount: { one: 'Télécharger {count} élément', other: 'Télécharger {count} éléments' },
  lazyHint: {
    one: 'Les parties de {count} vidéo seront récupérées à l’ajout à la file ; une vidéo en plusieurs parties devient plusieurs tâches',
    other: 'Les parties de {count} vidéos seront récupérées à l’ajout à la file ; les vidéos en plusieurs parties deviennent plusieurs tâches'
  },
  subscribeLink: 'S’abonner aux nouveautés : télécharger automatiquement les nouveaux contenus',
  checkInterval: 'Intervalle de vérification',
  subExisting: 'Télécharger aussi le contenu déjà présent (sinon, seulement les ajouts à venir)',
  subHint: 'Utilise la qualité et le format choisis ci-dessus ; vérifié uniquement pendant que l’application tourne',
  subscribe: 'S’abonner',
  cancel: 'Annuler',
  subscribed:
    'Abonné à « {title} ». Tant que l’application tourne, la source est vérifiée toutes les {interval} et les nouveautés sont téléchargées automatiquement'
} satisfies Messages['selection']
