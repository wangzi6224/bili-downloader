import type { Messages } from '../types'

export default {
  separator: ' ; ',
  parseFailures: {
    one: 'Échec de l’analyse de {count} lien : {errors}',
    other: 'Échec de l’analyse de {count} liens : {errors}'
  },
  watchLater: 'À regarder plus tard',
  popular: 'Tendances',
  weekly: 'Incontournables de la semaine (dernier numéro)',
  rank: 'Classement : {name}',
  myFavorites: 'Mes dossiers de favoris',
  loading: 'Chargement…',
  noFavorites: 'Aucun dossier de favoris',
  myMenu: 'À regarder plus tard, Tendances, Mes dossiers de favoris',
  myMenuLoggedOut: 'Disponible après connexion : À regarder plus tard, Tendances, Mes dossiers de favoris',
  batchTitle: 'Analyse groupée',
  batchSubtitle:
    'Un lien par ligne (BV, anime, dossier de favoris, créateur…). Les liens sont analysés un par un, puis réunis pour la sélection.',
  detectedLinks: { one: '{count} lien détecté', other: '{count} liens détectés' },
  cancel: 'Annuler',
  parseCount: { one: 'Analyser {count} lien', other: 'Analyser {count} liens' },
  placeholder: 'Collez un lien de vidéo, collection, anime, cours, dossier de favoris ou créateur',
  pasteAndParse: 'Coller depuis le presse-papiers et analyser',
  clearLink: 'Effacer le lien',
  parsing: 'Analyse…',
  parse: 'Analyser',
  batchButton: 'Analyse groupée : coller plusieurs liens à la fois',
  parsingProgress: 'Analyse {done}/{total}',
  clipboardLinks: {
    one: '{count} lien dans le presse-papiers',
    other: '{count} liens dans le presse-papiers'
  },
  clipboardLink: 'Lien détecté dans le presse-papiers'
} satisfies Messages['input']
