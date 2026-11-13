export default {
  group: 'Assistants IA',
  groupHint: 'Ajoutez Bili Downloader aux assistants IA que vous utilisez. Une fois installé, dites « télécharge cette vidéo Bilibili » ou « cherche … sur Bilibili » dans n’importe quelle conversation et ils utiliseront Bili Downloader. Les mises à jour suivent automatiquement celles de l’application.',
  installAll: 'Installation en un clic',
  installAllButton: 'Tout installer ({count})',
  installedAll: 'Installé pour {count} assistants IA. Redémarrez-les pour appliquer',
  install: 'Installer',
  update: 'Mettre à jour',
  uninstall: 'Retirer',
  installed: 'Installé dans {name}',
  installedRestart: 'Installé dans {name}. Redémarrez {name} pour appliquer',
  installedTrust: 'Installé dans {name}. Cliquez sur « Faire confiance » dans le panneau MCP de {name} pour l’activer',
  trustHint: 'Cliquez sur « Faire confiance » dans le panneau MCP de {name} pour l’activer',
  uninstalled: 'Retiré de {name}',
  withSkill: 'Service MCP et skill',
  mcpOnly: 'Service MCP seulement (skills non pris en charge)',
  skillConflict: 'Une skill du même nom existe déjà et n’a pas été remplacée',
  brokenHint: 'Fichier de configuration illisible, laissé tel quel : {file}',
  state_unsupported: 'Indisponible sur ce système',
  state_broken: 'Erreur de configuration',
  state_outdated: 'Mise à jour disponible',
  state_installed: 'Installé',
  state_notDetected: 'Non détecté',
  state_available: 'Prêt à installer',
  unknown: 'Assistant IA inconnu : {id}',
  unsupported: '{name} n’est pas disponible sur ce système',
  configBroken: 'Impossible de lire le fichier de configuration de {name} ; il a été laissé tel quel pour ne pas l’abîmer : {file}. Vérifiez le fichier, ou copiez la configuration dans « Connecter un client IA » et ajoutez-la à la main.',

  skillIntro:
    'Quand l’utilisateur veut télécharger des vidéos Bilibili, faire une recherche sur Bilibili, ou donne un lien Bilibili ou un identifiant BV, utilisez les outils MCP de {appName} (serveur bili-downloader). N’écrivez pas votre propre scraper et ne passez pas par d’autres outils de téléchargement. ' +
    '{appName} est une application de bureau sur l’ordinateur de l’utilisateur ; les fichiers sont enregistrés dans le dossier de téléchargement qui y est réglé.',
  skillWorkflow: 'Déroulement',
  skillTroubleshoot: 'Quand les outils ne marchent pas',
  skillTroubleshootBody:
    '- L’erreur indique que l’application n’est pas lancée : les outils ouvrent {appName} en arrière-plan automatiquement ; attendez quelques secondes et réessayez. Si cela échoue encore, demandez à l’utilisateur d’ouvrir {appName}.\n' +
    '- L’erreur indique que le service MCP est désactivé : demandez à l’utilisateur d’activer « Activer le service MCP » dans {appName} > Réglages > Assistants IA.\n' +
    '- Aucun outil bili-downloader n’est visible : demandez à l’utilisateur de cliquer sur « Installer » pour l’assistant IA utilisé dans {appName} > Réglages > Assistants IA, puis de le redémarrer.'
}
