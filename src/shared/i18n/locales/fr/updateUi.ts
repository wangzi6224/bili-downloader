import type { Messages } from '../types'

export default {
  skipVersion: 'Ignorer cette version',
  notNow: 'Plus tard',
  openDownloadPage: 'Aller à la page de téléchargement',
  downloadAndInstall: 'Télécharger et installer',
  cancelDownload: 'Annuler le téléchargement',
  downloadInBackground: 'Télécharger en arrière-plan',
  restartAndInstall: 'Redémarrer et installer',
  installingButton: 'Installation…',
  retry: 'Réessayer',
  title: 'Nouvelle version {version} disponible',
  currentVersion: 'Version actuelle : {version}',
  releasedOn: 'Publiée le {date}',
  packageSize: 'Paquet d’installation : {size}',
  noNotes: 'Aucune note de version pour cette version.',
  blocker: '{blocker}, ou installez-la manuellement depuis la page de téléchargement.',
  skipped: 'Vous avez ignoré cette version ; elle ne sera plus signalée lors des vérifications automatiques.',
  downloading: 'Téléchargement… il continue même si vous fermez la fenêtre',
  pendingTasks: {
    one: '{count} tâche n’est pas terminée. Le redémarrage la mettra en pause ; vous pourrez la reprendre après la mise à jour.',
    other: '{count} tâches ne sont pas terminées. Le redémarrage les mettra en pause ; vous pourrez les reprendre après la mise à jour.'
  },
  ready: 'La nouvelle version est téléchargée et vérifiée. Redémarrez pour l’utiliser.',
  installing: 'Installation en cours, l’application va se rouvrir automatiquement…'
} satisfies Messages['updateUi']
