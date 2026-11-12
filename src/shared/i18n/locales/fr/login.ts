import type { Messages } from '../types'

export default {
  windowClosedNotLoggedIn: 'La fenêtre de connexion a été fermée avant la fin de la connexion',
  expiredTitle: 'Votre connexion à Bilibili a expiré',
  title: 'Se connecter à Bilibili',
  expiredSubtitle:
    'Reconnectez-vous pour continuer l’analyse et le téléchargement. Les téléchargements en cours reprendront automatiquement une fois connecté.',
  subtitle: 'Téléchargez avec votre propre compte pour obtenir le 1080P et plus, ainsi que le contenu Bilibili Premium.',
  fromBrowser: 'Importer depuis un navigateur',
  redetect: 'Détecter à nouveau',
  detecting: 'Recherche des navigateurs…',
  loggedIn: 'Connecté à Bilibili',
  cannotImport: 'Import impossible',
  importing: 'Import en cours',
  import: 'Importer',
  scanToLogin: 'Connexion par QR code',
  pasteManually: 'Coller manuellement',
  appBoundBanner:
    '{browsers} protège ses informations de connexion par un chiffrement lié à l’application : seul le navigateur peut les lire, cette application ne peut pas les importer. Connectez-vous par QR code, ou copiez les cookies depuis le navigateur et collez-les manuellement.',
  chooseBrowserFolder: 'Choisir le dossier du navigateur',
  chooseBrowserFolderMessage: 'Sélectionnez ce dossier de données du navigateur : {path}',
  wrongBrowserFolder: 'Sélectionnez un dossier de données de navigateur pris en charge, par exemple {path}.',
  macBlocked: 'macOS a bloqué l’accès aux données de {browsers}. Sélectionnez le dossier de données du navigateur pour autoriser l’accès, ou connectez-vous dans l’application.',
  blocked:
    'Impossible de lire les données de {browsers} (l’utilisateur actuel n’a pas accès au dossier de profil du navigateur). Vous pouvez vous connecter directement dans l’application ci-dessous.',
  locked:
    '{browsers} est en cours d’exécution, ses informations de connexion sont illisibles. Quittez complètement le navigateur (y compris les processus en arrière-plan), puis cliquez sur « Détecter à nouveau ».',
  lockedAppBound:
    'Les versions récentes de Chrome et Edge protègent les informations de connexion par un chiffrement lié à l’application ; elles resteront probablement illisibles même après avoir quitté le navigateur. Nous vous conseillons la connexion par QR code.',
  noBrowserLoggedIn: 'Aucun des navigateurs trouvés n’est connecté à Bilibili',
  noBrowserFound: 'Aucun navigateur compatible trouvé',
  supported: ' (compatibles : {browsers})',
  notLoggedInList: 'Non connecté à Bilibili : {list}',
  profileLabel: '{browser} ({profile})',
  inApp: 'Se connecter dans l’application',
  inAppHint: 'Par QR code, mot de passe ou SMS. La fenêtre se ferme automatiquement une fois connecté',
  waitingLogin: 'En attente de la connexion',
  openLoginPage: 'Ouvrir la page de connexion',
  pasteCookie: 'Coller les cookies manuellement',
  pasteHint:
    'Collez un contenu du type « SESSDATA=…; bili_jct=…; DedeUserID=… », ou le JSON exporté par une extension comme Cookie-Editor. Les cookies équivalent à des identifiants de connexion et ne sont enregistrés que sur cet ordinateur.',
  pasteStep1: 'Ouvrez bilibili.com dans votre navigateur et vérifiez que vous êtes connecté ;',
  pasteStep2: 'Appuyez sur F12 pour ouvrir les outils de développement, puis allez dans Application → Cookies → https://www.bilibili.com ;',
  pasteStep3: 'Copiez tour à tour les valeurs de SESSDATA, bili_jct et DedeUserID, puis collez-les au format ci-dessus.',
  verifying: 'Vérification…',
  loginWithCookie: 'Se connecter avec ces cookies'
} satisfies Messages['login']
