import type { Messages } from '../types'

export default {
  title: 'Historique d’analyse',
  subtitle: 'Tous les liens analysés se trouvent ici. Cliquez sur l’un d’eux pour rouvrir la fenêtre de sélection et télécharger les épisodes restants.',
  search: 'Rechercher un titre ou un lien',
  clearConfirm: 'Effacer tout l’historique d’analyse ?',
  clear: 'Effacer',
  empty: 'Aucun historique d’analyse',
  emptyHint: 'Les liens collés et analysés sur la page Téléchargements sont enregistrés ici automatiquement.',
  noMatch: 'Aucun résultat',
  kindPgc: 'Anime / films et séries',
  kindVideo: 'Vidéo',
  itemCount: { one: '{count} élément', other: '{count} éléments' },
  remove: 'Supprimer cette entrée'
} satisfies Messages['history']
