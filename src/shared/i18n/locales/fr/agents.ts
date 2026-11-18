export default {
  group: 'Assistants IA',
  groupHint: 'Ajoutez Bili Downloader aux assistants IA que vous utilisez. Une fois installé, dites « télécharge cette vidéo Bilibili » ou « cherche … sur Bilibili » dans n’importe quelle conversation et ils utiliseront Bili Downloader. Les mises à jour suivent automatiquement celles de l’application.',
  installAll: 'Installation en un clic',
  installAllButton: 'Tout installer ({count})',
  installedAll: 'Installé pour {count} assistants IA. Redémarrez-les pour appliquer',
  install: 'Installer',
  update: 'Mettre à jour',
  uninstall: 'Retirer',
  installAnyway: 'Installer quand même',
  forceConfirm: '{name} est introuvable sur cet ordinateur. S’il est installé ailleurs, vous pouvez quand même l’installer ; la configuration sera écrite dans : {file}',
  installed: 'Installé dans {name}',
  installedRestart: 'Installé dans {name}. Redémarrez {name} pour appliquer',
  installedTrust: 'Installé dans {name}. Cliquez sur « Faire confiance » dans le panneau MCP de {name} pour l’activer',
  trustHint: 'Cliquez sur « Faire confiance » dans le panneau MCP de {name} pour l’activer',
  notDetectedHint: '{name} non détecté sur cet ordinateur',
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
  skillSearch: 'Choisir les vidéos',
  skillSearchBody:
    '- Quand l’utilisateur veut les « meilleures / dignes d’être vues / recommandées » : appelez d’abord search_videos avec order=quality (en affinant au besoin avec duration ou published_after) au lieu de vous fier au seul classement par défaut de Bilibili.\n' +
    '- Pour les 3 à 5 premières par score, lisez le résumé IA avec get_video_transcript et l’avis des commentaires avec get_video_comments (et get_video_info pour toutes les statistiques) afin de vérifier que le contenu convient et n’est pas du putaclic. Dites ensuite à l’utilisateur lesquelles vous recommandez, avec leurs vues, leurs chiffres d’engagement et vos raisons.\n' +
    '- Si le mot-clé est trop large, affinez-le ou filtrez avec duration / published_after. quality ne reclasse que le pool de candidats (50 par défaut), pas tout le site ; augmentez pool s’il faut plus de candidats.\n' +
    '- Quand l’utilisateur dit plus populaires / plus récentes / plus discutées / plus de danmaku / plus complètes / courtes et rapides, choisissez le tri correspondant d’après la description du paramètre order de search_videos.\n' +
    '- Si l’utilisateur veut seulement trouver des vidéos, présentez vos recommandations et leurs raisons, puis demandez s’il faut télécharger ; s’il a déjà demandé le téléchargement, téléchargez avec download_batch la mieux notée (ou celles qu’il a indiquées). Si la recherche déclenche le contrôle de risque de Bilibili, attendez quelques minutes au lieu de réessayer.',
  skillTroubleshoot: 'Quand les outils ne marchent pas',
  skillTroubleshootBody:
    '- L’erreur indique que l’application n’est pas lancée : les outils ouvrent {appName} en arrière-plan automatiquement ; attendez quelques secondes et réessayez. Si cela échoue encore, demandez à l’utilisateur d’ouvrir {appName}.\n' +
    '- L’erreur indique que le service MCP est désactivé : demandez à l’utilisateur d’activer « Activer le service MCP » dans {appName} > Réglages > Assistants IA.\n' +
    '- Aucun outil bili-downloader n’est visible : demandez à l’utilisateur de cliquer sur « Installer » pour l’assistant IA utilisé dans {appName} > Réglages > Assistants IA, puis de le redémarrer.'
}
