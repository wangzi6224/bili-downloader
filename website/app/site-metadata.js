const metadata = {
  zh: {
    title: 'B站下载器 — 一条链接，长成一座内容树',
    description: '在 Windows、macOS 和 Linux 上解析并下载 B 站视频、合集、番剧等内容，把字幕、弹幕和章节一并保存到本地。',
  },
  en: {
    title: 'Bili Downloader — One link, a whole content tree',
    description: 'Parse and download Bilibili videos, collections, anime and more on Windows, macOS and Linux, with subtitles, danmaku and chapters saved alongside.',
  },
};

export function pageMetadata(locale) {
  const copy = metadata[locale];
  return {
    title: copy.title,
    description: copy.description,
    icons: {
      icon: '/bili-downloader/media/app-icon.png',
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      type: 'website',
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
  };
}
