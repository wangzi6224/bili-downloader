// 设置页“AI 助手”：把 MCP 和 skill 装进各个 AI agent；skill 正文也在这里
export default {
  group: 'AI 助手',
  groupHint: '把 B站下载器装进常用的 AI 助手。装好后，在任何对话里说“下载这个 B站视频”“在 B站搜一下……”，它们都会用 B站下载器来做；应用升级后会自动更新。',
  installAll: '一键接入',
  installAllButton: '全部安装（{count}）',
  installedAll: '已为 {count} 个 AI 助手安装，重启它们后生效',
  install: '安装',
  update: '更新',
  uninstall: '移除',
  installAnyway: '仍要安装',
  forceConfirm: '本机没有检测到 {name}。如果它装在别的位置，仍然可以安装，配置会写进：{file}',
  installed: '已装进 {name}',
  installedRestart: '已装进 {name}，重启 {name} 后生效',
  installedTrust: '已装进 {name}，请在 {name} 的 MCP 面板里点“信任”后使用',
  trustHint: '在 {name} 的 MCP 面板里点“信任”后才会启用',
  notDetectedHint: '本机没检测到 {name}',
  uninstalled: '已从 {name} 移除',
  withSkill: 'MCP 服务和 skill',
  mcpOnly: '只装 MCP 服务（不支持 skill）',
  skillConflict: '已有同名的 skill，没有覆盖',
  brokenHint: '配置文件读不懂，没有改动：{file}',
  state_unsupported: '这个系统上没有',
  state_broken: '配置有误',
  state_outdated: '可更新',
  state_installed: '已安装',
  state_notDetected: '未检测到',
  state_available: '可安装',
  unknown: '不认识的 AI 助手：{id}',
  unsupported: '{name} 没有这个系统的版本',
  configBroken: '{name} 的配置文件读不懂，为了不弄坏它没有改动：{file}。请检查文件内容，或者用“接入 AI 客户端”复制配置手动添加。',

  skillIntro:
    '用户想下载 B站视频、在 B站搜索，或者给出 B站链接、BV 号时，用{appName}的 MCP 工具（服务名 bili-downloader）完成，不要自己写爬虫或换别的下载工具。' +
    '{appName}是用户电脑上的桌面应用，文件下载到它设置的下载目录。',
  skillWorkflow: '使用流程',
  skillTroubleshoot: '工具用不了时',
  skillTroubleshootBody:
    '- 报错说应用没有运行：工具会自动在后台打开{appName}，等几秒再试；还不行就请用户手动打开{appName}。\n' +
    '- 报错说 MCP 服务已关闭：请用户在{appName} > 设置 > AI 助手 里打开“开启 MCP 服务”。\n' +
    '- 根本看不到 bili-downloader 的工具：请用户在{appName} > 设置 > AI 助手 里给当前用的 AI 助手点“安装”，然后重启它。'
}
