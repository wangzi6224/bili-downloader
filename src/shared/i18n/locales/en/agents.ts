export default {
  group: 'AI assistants',
  groupHint: 'Add Bili Downloader to the AI assistants you use. Once installed, say “download this Bilibili video” or “search Bilibili for …” in any conversation and they will use Bili Downloader. Updates are applied automatically when the app is upgraded.',
  installAll: 'One-click setup',
  installAllButton: 'Install all ({count})',
  installedAll: 'Installed for {count} AI assistants. Restart them to take effect',
  install: 'Install',
  update: 'Update',
  uninstall: 'Remove',
  installed: 'Installed in {name}',
  installedRestart: 'Installed in {name}. Restart {name} to take effect',
  installedTrust: 'Installed in {name}. Click “Trust” in the MCP panel of {name} to enable it',
  trustHint: 'Click “Trust” in the MCP panel of {name} to enable it',
  uninstalled: 'Removed from {name}',
  withSkill: 'MCP server and skill',
  mcpOnly: 'MCP server only (skills not supported)',
  skillConflict: 'A skill with the same name already exists and was left as is',
  brokenHint: 'Couldn’t read the config file, left unchanged: {file}',
  state_unsupported: 'Not available on this system',
  state_broken: 'Config error',
  state_outdated: 'Update available',
  state_installed: 'Installed',
  state_notDetected: 'Not detected',
  state_available: 'Ready to install',
  unknown: 'Unknown AI assistant: {id}',
  unsupported: '{name} isn’t available on this system',
  configBroken: 'Couldn’t read the config file of {name}, so it was left unchanged to avoid breaking it: {file}. Check the file, or copy the config under “Connect an AI client” and add it manually.',

  skillIntro:
    'When the user wants to download Bilibili videos, search Bilibili, or gives a Bilibili link or BV id, use the MCP tools of {appName} (server name bili-downloader). Don’t write your own scraper or switch to other download tools. ' +
    '{appName} is a desktop app on the user’s computer; files are saved to the download folder set in it.',
  skillWorkflow: 'Workflow',
  skillTroubleshoot: 'When the tools don’t work',
  skillTroubleshootBody:
    '- The error says the app isn’t running: the tools open {appName} in the background automatically; wait a few seconds and try again. If it still fails, ask the user to open {appName}.\n' +
    '- The error says the MCP server is off: ask the user to turn on “Enable MCP server” in {appName} > Settings > AI assistants.\n' +
    '- There are no bili-downloader tools at all: ask the user to click “Install” for the current AI assistant in {appName} > Settings > AI assistants, then restart it.'
}
