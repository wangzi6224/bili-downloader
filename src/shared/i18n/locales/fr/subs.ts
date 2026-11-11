import type { Messages } from '../types'

export default {
  interval30m: '30 minutes',
  // 只用在“Toutes les {interval}”里，所以写成“heures”“24 heures”
  interval1h: 'heures',
  interval3h: '3 heures',
  interval6h: '6 heures',
  interval12h: '12 heures',
  interval1d: '24 heures',
  everyInterval: 'Toutes les {interval}',
  title: 'Abonnements',
  subtitle:
    'Tant que l’application tourne, les dossiers de favoris, collections, anime, créateurs et autres sources sont vérifiés à intervalle régulier ; les nouveautés sont téléchargées automatiquement avec les options choisies lors de l’abonnement.',
  empty: 'Aucun abonnement',
  emptyHint:
    'Après avoir analysé un dossier de favoris, une collection, un anime ou la page d’un créateur, cliquez sur « S’abonner aux nouveautés » en bas de la fenêtre de sélection.',
  enabled: 'Activé',
  disabled: 'Désactivé',
  lastNew: {
    one: '{count} nouveau contenu trouvé la dernière fois',
    other: '{count} nouveaux contenus trouvés la dernière fois'
  },
  checking: 'Vérification…',
  checkNow: 'Vérifier maintenant',
  unsubscribe: 'Se désabonner',
  unsubscribeConfirm: 'Se désabonner de « {title} » ?'
} satisfies Messages['subs']
