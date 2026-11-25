import type { Messages } from '../types'

export default {
  noLoginCookie: 'Aucune connexion YouTube trouvée (SAPISID manquant). Vérifiez que vous êtes connecté à YouTube dans le navigateur',
  verifyFailed: 'Impossible de vérifier la connexion YouTube : {reason}',
  expired: 'Cette connexion YouTube a expiré. Reconnectez-vous à YouTube dans le navigateur, puis importez-la à nouveau',
  accountNotFound: 'Compte YouTube introuvable',
  noLoginInBrowser: 'Aucune information de connexion YouTube n’a été trouvée dans ce profil de navigateur. Connectez-vous d’abord à YouTube dans le navigateur'
} satisfies Messages['ytLogin']
