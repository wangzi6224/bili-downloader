import type { Messages } from '../types'

export default {
  title: 'Fermer la fenêtre',
  subtitle: 'En arrière-plan, les téléchargements et la vérification des abonnements continuent. Vous pouvez rouvrir la fenêtre depuis {reopenFrom}.',
  pendingTasks: {
    one: '{count} tâche n’est pas terminée. Quitter complètement la mettra en pause ; vous pourrez la reprendre à la prochaine ouverture.',
    other: '{count} tâches ne sont pas terminées. Quitter complètement les mettra en pause ; vous pourrez les reprendre à la prochaine ouverture.'
  },
  remember: 'Mémoriser mon choix et ne plus demander',
  rememberHint: 'Modifiable ensuite dans « Réglages → Général »',
  cancel: 'Annuler',
  quit: 'Quitter',
  background: 'Continuer en arrière-plan'
} satisfies Messages['closeDialog']
