// 页面、下载、登录用同一个 UA：保留真实的操作系统和 Chromium 大版本，去掉 Electron 和应用名
export function dyUserAgent(platform: NodeJS.Platform = process.platform, chrome: string | undefined = process.versions.chrome): string {
  const major = chrome?.split('.')[0] || '140'
  const os = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

/** 下载抖音 CDN 文件时的请求头：CDN 校验 Referer */
export const dyHeaders = (ua = dyUserAgent()): Record<string, string> => ({ 'User-Agent': ua, Referer: 'https://www.douyin.com/' })
