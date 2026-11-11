import type { Messages } from '../types'

export default {
  /** 接口没给会员标签时显示 */
  vipDefault: 'Premium',
  notifyDoneTitle: 'Téléchargements terminés',
  notifyDoneBody: {
    one: '{count} tâche terminée',
    other: 'Les {count} tâches sont toutes terminées'
  },
  notifyFailedTitle: 'Téléchargements terminés, avec des échecs',
  notifyFailedBody: '{done} terminée(s), {failed} en échec',
  notifySubsTitle: 'Nouveautés dans vos abonnements',
  notifySubsBody: {
    one: '« {title} » : {count} nouveau contenu, ajouté aux téléchargements',
    other: '« {title} » : {count} nouveaux contenus, ajoutés aux téléchargements'
  },
  fetchingParts: 'Récupération des parties de la vidéo',
  partsUnavailable: {
    one: '{count} vidéo inaccessible ({reason})',
    other: '{count} vidéos inaccessibles ({reason})'
  }
} satisfies Messages['misc']
