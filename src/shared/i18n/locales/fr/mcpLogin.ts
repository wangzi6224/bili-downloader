import type { Messages } from '../types'

// MCP 登录工具：start_login / get_login_status 的说明、提示，以及登录流程的失败原因
export default {
  startTitle: 'Se connecter à Bilibili',
  startDesc:
    'Permet de se connecter à Bilibili. Par défaut, importe la connexion depuis le navigateur de l’utilisateur : dans l’ordre Chrome, autres navigateurs basés sur Chrome, Opera, Firefox, Safari, en prenant d’abord ceux qui sont lisibles directement ; les cookies ne sont enregistrés que dans l’application et ne figurent pas dans le résultat. ' +
    'Si l’import échoue, suivez le next renvoyé : avec next=try_qr, prévenez l’utilisateur puis utilisez method=qr pour afficher la fenêtre de QR code, et attendez la fin de la connexion avec get_login_status et wait_seconds. ' +
    'Dans le mode par défaut, si le compte actif est déjà connecté, l’outil renvoie son état immédiatement. S’il faut fermer le navigateur, l’application le demande elle-même à l’utilisateur dans une fenêtre ; aucun paramètre ici ne permet de le fermer directement.',
  startMethod: 'browser importer depuis un navigateur (par défaut) ; qr afficher une fenêtre de connexion pour que l’utilisateur scanne un QR code',
  startSource:
    'Navigateur à utiliser, comme chrome, edge, opera, firefox, safari, ou un id de profil listé par get_login_status. Choisi automatiquement s’il n’est pas fourni',
  startWait:
    'Durée d’attente maximale en secondes, {n} par défaut. Renvoie immédiatement si la connexion aboutit, échoue ou nécessite une action de l’utilisateur',

  statusTitle: 'Progression de la connexion',
  statusDesc:
    'Consulte la progression de start_login. Avec wait_seconds supérieur à 0, la réponse n’arrive qu’en cas de réussite, d’échec ou de changement d’état : elle est renvoyée dès que la connexion réussit, ce qui sert de notification de fin du scan du QR code ; plus simple que d’interroger à répétition. ' +
    'Une connexion faite par l’utilisateur lui-même dans l’application compte aussi. Si le délai expire et que l’état est toujours waiting_user, appelez à nouveau. Avec include_browsers=true, liste les navigateurs de cet ordinateur et indique s’ils sont connectés à Bilibili.',
  statusWait: 'Durée d’attente maximale en secondes, 0 par défaut',
  statusBrowsers: 'Lister ou non les navigateurs de cet ordinateur, false par défaut',

  // 失败后的下一步（按 reason）
  hintLocked:
    'Le navigateur est en cours d’exécution. Vous pouvez demander à l’utilisateur de le quitter complètement (y compris les processus en arrière-plan) puis réessayer, ou passer au QR code',
  hintAppBound:
    'Ce navigateur protège les informations de connexion par un chiffrement lié à l’application, elles sont illisibles ; passez au QR code',
  hintBlocked: 'Sous macOS, choisissez le dossier du navigateur dans la fenêtre de connexion de {appName}. Sur les autres systèmes, vérifiez les permissions du dossier. Vous pouvez aussi vous connecter par code QR.',
  hintNoLogin:
    'Le navigateur n’est pas connecté à Bilibili. Si l’utilisateur vient de s’y connecter, attendez une trentaine de secondes avant de réessayer (le navigateur n’enregistre pas immédiatement), ou passez au QR code',
  hintExpired:
    'La connexion Bilibili du navigateur a expiré ; passez au QR code, ou demandez d’abord à l’utilisateur de se reconnecter dans le navigateur',
  hintKeychainDenied:
    'L’utilisateur n’a pas cliqué sur « Autoriser » dans la fenêtre du trousseau. Demandez-lui s’il veut réessayer, ou passez au QR code',
  hintNetwork: 'Bilibili est injoignable, ou la requête a été bloquée par le système anti-abus ; réessayez un peu plus tard',
  hintDeclined:
    'L’utilisateur a refusé de fermer le navigateur, ne réessayez pas à répétition. Demandez-lui s’il veut se connecter par QR code avec start_login method=qr',
  hintConfirmTimeout:
    'L’utilisateur n’a pas répondu à la boîte de dialogue, il ne l’a peut-être pas vue. Invitez-le à y faire attention puis réessayez, ou passez au QR code',
  hintCloseFailed: 'Le navigateur n’a pas pu être fermé. Vous pouvez demander à l’utilisateur de le quitter manuellement puis réessayer, ou passer au QR code',
  hintWindowClosed: 'L’utilisateur a fermé la fenêtre de connexion. Demandez-lui s’il veut la rouvrir',
  hintNotFound: 'Vous pouvez voir les navigateurs de cet ordinateur avec get_login_status include_browsers=true, ou passer au QR code',
  hintFailed: 'Vous pouvez essayer un autre navigateur, ou passer au QR code',

  // 进行中的步骤
  stepChecking: 'Vérification de l’état de connexion. Attendez le résultat avec get_login_status wait_seconds=30',
  stepImporting:
    'Lecture des informations de connexion du navigateur. macOS peut demander l’accès au trousseau et Linux le déverrouillage du trousseau de clés : rappelez à l’utilisateur de cliquer sur « Autoriser ». Attendez le résultat avec get_login_status wait_seconds=30',
  stepConfirmClose:
    'L’application a affiché une boîte de dialogue demandant s’il faut fermer le navigateur ; rappelez à l’utilisateur d’y répondre. Attendez le résultat avec get_login_status wait_seconds=30',
  stepClosingBrowser: 'L’utilisateur a accepté, fermeture du navigateur en cours. Attendez le résultat avec get_login_status wait_seconds=30',
  stepQr:
    'La fenêtre de connexion est ouverte ; dites à l’utilisateur de scanner le QR code avec l’app Bilibili. Attendez le résultat avec get_login_status wait_seconds=50 : la réponse arrive dès que la connexion réussit ; si le délai expire, appelez à nouveau',

  interrupted: 'Ces lots ont été interrompus ; continuez avec control_tasks action=resume batch_id=…',

  // 登录流程的失败说明（snapshot.message）
  qrClosed: 'La fenêtre de connexion a été fermée avant la fin de la connexion',
  sourceNotFound: '« {source} » introuvable ; vous pouvez voir les navigateurs de cet ordinateur avec get_login_status include_browsers=true',
  appBoundLogin:
    'La connexion Bilibili de {browser} est enregistrée avec un chiffrement lié à l’application, seul le navigateur peut la lire ; passez au QR code',
  appBoundLocked:
    '{browser} utilise un chiffrement lié à l’application ; les informations de connexion resteront probablement illisibles même après sa fermeture',
  browserRunning: '{browser} est en cours d’exécution ; l’utilisateur doit le quitter manuellement avant l’import',
  noPermission: 'Pas l’autorisation de lire les données de {browser}',
  noLoginIn: 'Aucune connexion Bilibili dans {browser}',
  noBrowser: 'Aucun navigateur compatible trouvé',
  noLoginReadable: 'Aucun des navigateurs lisibles n’est connecté à Bilibili ; {browser} n’est pas lisible faute d’autorisation',
  noLoginAny: 'Aucun des navigateurs trouvés n’est connecté à Bilibili',
  confirmTimeout: 'L’utilisateur n’a pas répondu à la boîte de dialogue demandant s’il faut fermer {browser}',
  declined: 'L’utilisateur a refusé de fermer {browser}',
  closeFailed: 'Impossible de fermer {browser}',
  closedNoLogin: '{browser} a été fermé, mais ne contient aucune connexion Bilibili'
} satisfies Messages['mcpLogin']
