import type { Messages } from '../types'

export default {
  macFileManager: 'le Finder',
  macReopenFrom: 'le Dock ou l’icône de la barre des menus',
  macAv1Hint: 'Le plus compact, nécessite un Mac M1 ou plus récent',
  macChromiumAuthHint:
    'Lors de l’import depuis un navigateur basé sur Chrome, macOS demande l’accès au trousseau : cliquez sur « Autoriser ».',
  linuxFileManager: 'le gestionnaire de fichiers',
  linuxChromiumAuthHint:
    'Les navigateurs basés sur Chrome stockent les informations de connexion dans le trousseau de clés du système. Si un déverrouillage est demandé lors de l’import, saisissez votre mot de passe de session.',
  winFileManager: 'l’Explorateur de fichiers',
  winChromiumAuthHint:
    'L’import déchiffre la clé du navigateur avec l’identité de l’utilisateur Windows actuel, sans fenêtre d’autorisation.',
  trayIcon: 'l’icône de la zone de notification',
  av1Hint: 'Le plus compact, la lecture peut saccader sur les ordinateurs anciens'
} satisfies Messages['platform']
