import type { Messages } from '../types'

export default {
  ok: 'OK',
  cancel: 'Annuler',
  logoutMessage: 'Voulez-vous vraiment vous déconnecter ?',
  logoutDetail: 'Après la déconnexion, il faudra réimporter ou vous reconnecter.',
  mcpLogoutMessage: 'Votre assistant IA demande la déconnexion de {name}. Se déconnecter ?',
  logoutConfirm: 'Se déconnecter',
  upToDate: 'Vous avez la dernière version',
  currentVersion: 'Version actuelle : {version}',
  quitPending: {
    one: '{count} tâche n’est pas terminée. Voulez-vous vraiment quitter ?',
    other: '{count} tâches ne sont pas terminées. Voulez-vous vraiment quitter ?'
  },
  quitPendingDetail:
    'Les téléchargements inachevés seront mis en pause ; à la prochaine ouverture, cliquez sur « Tout reprendre » pour continuer, sans perdre ce qui est déjà téléchargé. Les vidéos en cours de suppression du filigrane restent inchangées.',
  runInBackground: 'Continuer en arrière-plan',
  quit: 'Quitter',
  closeBrowserMessage: 'Fermer {browser} pour importer la connexion Bilibili ?',
  closeBrowserRequest:
    'L’assistant IA demande à importer la connexion Bilibili, mais {browser} est en cours d’exécution et ses données sont illisibles.',
  closeBrowserRisk:
    'Le contenu non enregistré risque d’être perdu à la fermeture ; si {browser} ne se ferme pas à temps, il sera arrêté de force.',
  closeBrowserAppBound:
    '{browser} utilise un chiffrement lié à l’application ; les informations de connexion risquent de rester illisibles même après sa fermeture.',
  closeBrowserUnknown: 'On ne sait pas encore si {browser} contient une connexion Bilibili.',
  closeBrowserConfirm: 'Fermer {browser} et importer',
  useQrInstead: 'Utiliser le QR code',
  loginWindowTitle: 'Connexion à Bilibili',
  chooseDownloadDir: 'Choisir le dossier de téléchargement'
} satisfies Messages['dialogs']
