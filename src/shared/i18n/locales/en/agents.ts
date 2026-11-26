export default {
  group: 'AI assistants',
  groupHint: 'Add Bili Downloader to the AI assistants you use. Once installed, say “download this Bilibili video” or “search Bilibili for …” in any conversation and they will use Bili Downloader. Updates are applied automatically when the app is upgraded.',
  installAll: 'One-click setup',
  installAllButton: 'Install all ({count})',
  installedAll: 'Installed for {count} AI assistants. Restart them to take effect',
  install: 'Install',
  update: 'Update',
  uninstall: 'Remove',
  installAnyway: 'Install anyway',
  forceConfirm: '{name} wasn’t found on this computer. If it’s installed somewhere else, you can still install; the config will be written to: {file}',
  installed: 'Installed in {name}',
  installedRestart: 'Installed in {name}. Restart {name} to take effect',
  installedTrust: 'Installed in {name}. Click “Trust” in the MCP panel of {name} to enable it',
  trustHint: 'Click “Trust” in the MCP panel of {name} to enable it',
  notDetectedHint: '{name} not detected on this computer',
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
  skillSearch: 'Picking videos',
  skillSearchBody:
    '- When the user wants the “best / worth watching / recommended” videos: call search_videos with order=quality first (narrow it with duration or published_after if needed) instead of relying only on Bilibili’s default ranking.\n' +
    '- For the top 3–5 by score, read the AI summary with get_video_transcript and the comments with get_video_comments (and get_video_info for the full stats) to confirm the content fits and isn’t clickbait. Then tell the user which ones you recommend, with their views, engagement numbers and your reasons.\n' +
    '- If the keyword is too broad, narrow it or filter with duration / published_after. quality only re-ranks the candidate pool (50 by default), not the whole site; raise pool if you need more candidates.\n' +
    '- When the user says hottest / newest / most discussed / most danmaku / most complete / short and quick, pick the matching order as described in the order parameter of search_videos.\n' +
    '- If the user only wants to find videos, report your recommendations and reasons, then ask whether to download; if they already asked to download, download the top-scoring one (or the ones they specified) with download_batch. When search hits Bilibili’s risk control, wait a few minutes instead of retrying.',
  skillTroubleshoot: 'When the tools don’t work',
  skillTroubleshootBody:
    '- The error says the app isn’t running: the tools open {appName} in the background automatically; wait a few seconds and try again. If it still fails, ask the user to open {appName}.\n' +
    '- The error says the MCP server is off: ask the user to turn on “Enable MCP server” in {appName} > Settings > AI assistants.\n' +
    '- There are no bili-downloader tools at all: ask the user to click “Install” for the current AI assistant in {appName} > Settings > AI assistants, then restart it.',
  ytSkillIntro: 'Use {appName} (running on this computer) to download YouTube videos, Shorts, playlists, channels and YouTube Music, and to search videos and read subtitles and comments. The app must be open with the service enabled in Settings → AI Assistants; the YouTube component (yt-dlp) is downloaded automatically the first time YouTube is used.',
  ytSkillTroubleshootBody: '- Asked to update the component: call youtube_update_engine.\n- Bot checks, or members-only / age-restricted videos fail: import the YouTube login with youtube_start_login; the system may ask for permission to read the browser, ask the user to allow it.\n- In mainland China YouTube needs a proxy: ask the user to set one in Settings → Network & advanced (HTTP and SOCKS are supported).\n- Auto-translated subtitles are often rate-limited by YouTube; retry later or use manual subtitles.',
  dySkillIntro: 'Use {appName} (running on this computer) to download Douyin videos, photo posts, collections and creators’ posts, search, and read details and comments. The app must be open with the service enabled in “Settings → AI assistants”. Douyin has no subtitles or AI summaries.',
  dySkillTroubleshootBody: '- VERIFY_REQUIRED: call douyin_open_verification and let the user complete the check in the window; do not keep retrying.\n- RATE_LIMITED: Douyin is limiting requests; wait a few minutes.\n- Sign-in required (more posts, likes, favorites, search, replies): call douyin_start_login so the user can scan the QR code.\n- Large batches and subscriptions trigger checks easily; submit moderate amounts.'
}
