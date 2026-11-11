import type { Messages } from '../types'

export default {
  loginRequired: 'Veuillez d’abord vous connecter',
  loginRequiredAccount: 'Veuillez d’abord vous connecter à votre compte Bilibili',
  loginExpired: 'La connexion a expiré, veuillez vous reconnecter',
  appBoundCookie:
    'Les cookies protégés par un chiffrement lié à l’application ne peuvent pas être importés. Connectez-vous dans l’application ou collez les cookies manuellement',
  missingKey: 'Clé de déchiffrement manquante pour {prefix}',
  incompleteCookie: 'Données chiffrées des cookies Chromium incomplètes',
  /** 没有权限读取的浏览器，在配置档名的位置显示 */
  blockedProfile: 'Lecture non autorisée',
  keychainNotFound: '« {service} » introuvable dans le trousseau',
  keychainDenied: 'Accès au trousseau refusé ({service}). Cliquez sur « Autoriser » dans la fenêtre du système',
  secretToolMissing:
    'La lecture des informations de connexion des navigateurs basés sur Chrome nécessite secret-tool. Installez-le d’abord (Debian / Ubuntu : sudo apt install libsecret-tools), ou connectez-vous dans l’application',
  keyringNotFound:
    'Le mot de passe du navigateur est introuvable dans le trousseau de clés du système (application={application}), ou le trousseau n’est pas déverrouillé. Vous pouvez aussi vous connecter dans l’application',
  winKeyUnreadable:
    'Impossible de lire la clé de chiffrement du navigateur Windows. Connectez-vous dans l’application ou collez les cookies manuellement',
  winKeyMissing:
    'Le navigateur Windows n’a pas de clé DPAPI lisible. Connectez-vous dans l’application ou collez les cookies manuellement',
  winKeyUnsupported:
    'Format de clé du navigateur Windows non pris en charge. Connectez-vous dans l’application ou collez les cookies manuellement',
  browserLocked:
    '{browser} est en cours d’exécution, ses informations de connexion sont illisibles. Quittez complètement {browser} (y compris les processus en arrière-plan) avant d’importer, ou connectez-vous dans l’application',
  profileNotFound: 'Profil de navigateur introuvable, ou lecture non autorisée',
  noPermission: 'Lecture des données de {browser} non autorisée',
  noLogin: 'Aucune connexion Bilibili dans {browser} ({profile})',
  importedExpired:
    'Les informations de connexion importées ne sont plus valides. Reconnectez-vous d’abord à Bilibili dans le navigateur, ou connectez-vous dans l’application',
  cookieUnreadable:
    'Contenu incompréhensible. Collez des cookies du type « SESSDATA=…; bili_jct=… », ou le JSON exporté par une extension',
  noSessdata: 'SESSDATA est absent, connexion impossible',
  cookieExpired: 'Ces cookies ne sont plus valides, veuillez les récupérer à nouveau',
  confirmTimeout: 'Délai dépassé pour confirmer la connexion, vérifiez le réseau',
  importCancelled: 'Cet import a été annulé',
  dpapiTimeout: 'Délai dépassé pour le déchiffrement DPAPI. Connectez-vous dans l’application ou collez les cookies manuellement',
  dpapiFailed: 'Échec du déchiffrement DPAPI : {reason}',
  powershellExitCode: 'Code de sortie PowerShell {code}',
  dpapiIncomplete: 'PowerShell n’a pas renvoyé un résultat de déchiffrement complet',
  safariCorrupt: 'Le fichier de cookies de Safari est endommagé',
  notSafariCookies: 'Ce n’est pas un fichier de cookies de Safari'
} satisfies Messages['authErr']
