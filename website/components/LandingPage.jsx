import Image from 'next/image';
import Link from 'next/link';
import BranchExplorer from './BranchExplorer';
import { siteCopy } from '../lib/site-content';

const REPOSITORY = 'https://github.com/wangzi6224/bili-downloader';
const RELEASES = REPOSITORY + '/releases/latest';
const README_ZH = REPOSITORY + '/blob/main/README.zh-CN.md';
const README_EN = REPOSITORY + '/blob/main/README.md';
const ASSET_ROOT = '/bili-downloader/media/';

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M10 4.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function ExternalMark() {
  return <span className="external-mark" aria-hidden="true">↗</span>;
}

function Brand({ locale }) {
  return (
    <Link className="brand" href={locale === 'zh' ? '/' : '/en/'} aria-label={locale === 'zh' ? 'B站下载器首页' : 'Bili Downloader home'}>
      <Image src={ASSET_ROOT + 'app-icon.png'} alt="" width={42} height={42} priority unoptimized />
      <span className="brand-text">
        <strong>{locale === 'zh' ? 'B站下载器' : 'Bili Downloader'}</strong>
        <small>{locale === 'zh' ? 'DESKTOP · LOCAL' : 'DESKTOP · LOCAL'}</small>
      </span>
    </Link>
  );
}

function SectionMarker({ children }) {
  return <p className="section-marker"><span className="marker-line" />{children}</p>;
}

export default function LandingPage({ locale }) {
  const copy = siteCopy[locale];
  const english = locale === 'en';
  const readme = english ? README_EN : README_ZH;

  return (
    <>
      <a className="skip-link" href="#main">{copy.skip}</a>
      <header className="site-header">
        <div className="header-inner">
          <Brand locale={locale} />
          <nav aria-label={english ? 'Main navigation' : '主导航'} className="main-nav">
            <a href="#features">{copy.navFeatures}</a>
            <a href="#workflow">{copy.navWorkflow}</a>
            <a href="#platforms">{copy.navPlatforms}</a>
            <a href={REPOSITORY} rel="noreferrer" target="_blank">{copy.navSource}<ExternalMark /></a>
          </nav>
          <div className="header-actions">
            <Link className="language-toggle" href={english ? '/' : '/en/'} lang={english ? 'zh-CN' : 'en'}>
              {english ? '中文' : 'EN'}
            </Link>
            <a className="header-cta" href={RELEASES} rel="noreferrer" target="_blank">
              <span>{copy.navCta}</span><ArrowIcon />
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-grid shell">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-dot" />{copy.eyebrow}</p>
              <h1 id="hero-title">
                {copy.heroLineOne}<br />
                <span>{copy.heroLineTwo}</span>
              </h1>
              <p className="hero-intro">{copy.heroBody}</p>
              <div className="hero-actions">
                <a className="button button-primary" href={RELEASES} rel="noreferrer" target="_blank">
                  <span className="download-icon" aria-hidden="true">↓</span>{copy.ctaDownload}<ArrowIcon />
                </a>
                <a className="button button-secondary" href="#features">{copy.ctaExplore}<span aria-hidden="true">⌄</span></a>
              </div>
              <div className="hero-meta">
                <span className="platform-line">{copy.supported}</span>
                <span className="hero-meta-divider" />
                <span className="local-label"><span className="local-dot" />{copy.localBadge}</span>
              </div>
            </div>

            <div className="hero-graphic" aria-label={english ? 'Interactive illustration of a link branching into download choices' : '一条链接展开成不同下载选项的交互示意图'}>
              <div className="graphic-orbit orbit-one" aria-hidden="true" />
              <div className="graphic-orbit orbit-two" aria-hidden="true" />
              <div className="graphic-index" aria-hidden="true"><span>FIG. 01</span><span>LOCAL ARCHIVE SYSTEM</span></div>
              <BranchExplorer locale={locale} />
              <span className="graphic-corner corner-tl" aria-hidden="true" />
              <span className="graphic-corner corner-br" aria-hidden="true" />
            </div>
          </div>
          <div className="hero-bottomline shell" aria-hidden="true">
            <span>BV → COLLECTION → LOCAL FILE</span>
            <span>01—05 <i /></span>
          </div>
        </section>

        <section className="source-section section-pad" id="features" aria-labelledby="source-title">
          <div className="shell source-layout">
            <div className="section-aside">
              <SectionMarker>{copy.sectionOne}</SectionMarker>
              <p className="aside-note">{english ? 'ONE ROOT / MANY BRANCHES' : '一条根 / 多种枝'}</p>
            </div>
            <div className="source-main">
              <h2 id="source-title">{copy.sectionOneTitle}</h2>
              <p className="section-lede">{copy.sectionOneBody}</p>
              <div className="source-ribbons" aria-label={english ? 'Supported link types' : '支持解析的链接类型'}>
                <span><b>BV / av</b>{english ? 'Video' : '视频'}</span>
                <span><b>ep / ss / md</b>{english ? 'Anime & film' : '番剧 / 影视'}</span>
                <span><b>fav / series</b>{english ? 'Lists' : '收藏 / 合集'}</span>
                <span><b>au / am</b>{english ? 'Audio' : '音频'}</span>
                <span><b>UP</b>{english ? 'Creator' : '投稿'}</span>
                <span><b>rank</b>{english ? 'Rankings' : '排行榜'}</span>
              </div>
              <div className="source-footnote">
                <span className="footnote-index">01—08</span>
                <span>{english ? 'Short links and share text are accepted too.' : '也支持短链接和带标题的分享文案。'}</span>
                <span className="footnote-arrow" aria-hidden="true">↘</span>
              </div>
            </div>
          </div>
        </section>

        <section className="context-section section-pad" id="workflow" aria-labelledby="context-title">
          <div className="shell">
            <div className="context-heading">
              <div>
                <SectionMarker>{copy.sectionTwo}</SectionMarker>
                <h2 id="context-title">{copy.sectionTwoTitle}</h2>
              </div>
              <p className="section-lede">{copy.sectionTwoBody}</p>
            </div>

            <div className="screenshots-grid">
              <figure className="screenshot-card screenshot-card-wide">
                <div className="screenshot-topline"><span>01 / DOWNLOAD QUEUE</span><span className="screen-live"><i /> DESKTOP APP</span></div>
                <div className="screenshot-image screenshot-queue">
                  <Image src={ASSET_ROOT + 'queue.png'} alt={copy.screenshotQueueAlt} width={1600} height={1047} sizes="(max-width: 760px) 100vw, 58vw" unoptimized />
                </div>
                <figcaption><span>{copy.queueCaption}</span><b>QUEUE / 01</b></figcaption>
              </figure>
              <figure className="screenshot-card screenshot-card-select">
                <div className="screenshot-topline"><span>02 / ITEM SELECTION</span><span>QUALITY + EXTRAS</span></div>
                <div className="screenshot-image screenshot-select">
                  <Image src={ASSET_ROOT + 'select.png'} alt={copy.screenshotSelectAlt} width={1600} height={1047} sizes="(max-width: 760px) 100vw, 42vw" unoptimized />
                </div>
                <figcaption><span>{copy.selectCaption}</span><b>OPTIONS / 02</b></figcaption>
              </figure>
            </div>

            <div className="quality-band">
              <div className="quality-intro">
                <span className="micro-label">{english ? 'QUALITY FROM THE API' : '画质来自接口'}</span>
                <strong>{english ? 'Choose what your account can access.' : '在账号权限内，选你能看的清晰度。'}</strong>
              </div>
              <div className="quality-stamps" aria-label={english ? 'Example quality levels' : '画质示例'}>
                <span>8K</span><span>DOLBY VISION</span><span>HDR</span><span>4K</span><span>1080P60</span>
              </div>
              <div className="quality-formats"><b>AVC</b><b>HEVC</b><b>AV1</b><i />MP4 / MKV</div>
            </div>
          </div>
        </section>

        <section className="queue-section section-pad" aria-labelledby="queue-title">
          <div className="shell queue-layout">
            <div className="queue-intro">
              <SectionMarker>{copy.sectionThree}</SectionMarker>
              <h2 id="queue-title">{copy.sectionThreeTitle}</h2>
              <p className="section-lede">{copy.sectionThreeBody}</p>
              <div className="queue-speed" aria-hidden="true"><span className="speed-label">QUEUE CONTROL</span><span className="speed-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span><span className="speed-state">READY TO RESUME</span></div>
            </div>
            <div className="queue-feature-list">
              <article className="queue-feature">
                <span className="feature-index">01</span>
                <div><h3>{copy.featureConcurrency}</h3><p>{copy.featureConcurrencyBody}</p></div>
                <span className="feature-symbol" aria-hidden="true">↗</span>
              </article>
              <article className="queue-feature">
                <span className="feature-index">02</span>
                <div><h3>{copy.featureResume}</h3><p>{copy.featureResumeBody}</p></div>
                <span className="feature-symbol feature-symbol-pink" aria-hidden="true">Ⅱ</span>
              </article>
              <article className="queue-feature">
                <span className="feature-index">03</span>
                <div><h3>{copy.featureSubscriptions}</h3><p>{copy.featureSubscriptionsBody}</p></div>
                <span className="feature-symbol" aria-hidden="true">⌁</span>
              </article>
            </div>
          </div>
        </section>

        <section className="automation-section section-pad" aria-labelledby="automation-title">
          <div className="shell automation-grid">
            <div className="automation-copy">
              <SectionMarker>{copy.sectionFour}</SectionMarker>
              <h2 id="automation-title">{copy.sectionFourTitle}</h2>
              <p className="section-lede">{copy.sectionFourBody}</p>
            </div>
            <div className="mcp-panel">
              <div className="mcp-panel-top"><span><i /> {copy.mcpLabel}</span><span className="mcp-lock" aria-hidden="true">⌑</span></div>
              <div className="mcp-panel-body">
                <span className="mcp-prompt">bili-downloader <i>~</i></span>
                <span className="mcp-command"><b>01</b><code>{copy.mcpCallOne}</code><small>{english ? 'Find videos' : '搜索视频'}</small></span>
                <span className="mcp-command"><b>02</b><code>{copy.mcpCallTwo}</code><small>{english ? 'Expand a link' : '展开链接'}</small></span>
                <span className="mcp-command"><b>03</b><code>{copy.mcpCallThree}</code><small>{english ? 'Queue a batch' : '加入批次'}</small></span>
                <div className="mcp-return"><span>↳</span>{english ? 'Runs on your machine' : '在你的电脑上运行'}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="watermark-section" aria-labelledby="watermark-title">
          <div className="watermark-grid shell">
            <div className="watermark-art" aria-hidden="true">
              <div className="frame-cross cross-one" />
              <div className="frame-cross cross-two" />
              <div className="watermark-frame"><span className="frame-corner frame-a" /><span className="frame-corner frame-b" /><span className="frame-corner frame-c" /><span className="frame-corner frame-d" /><i>W</i></div>
              <div className="watermark-orbit orbit-a" /><div className="watermark-orbit orbit-b" />
              <span className="art-coordinate coordinate-one">X 0.94 / Y 0.08</span>
              <span className="art-coordinate coordinate-two">LOCAL FILE / FRAME 028</span>
            </div>
            <div className="watermark-copy">
              <p className="eyebrow eyebrow-light"><span className="eyebrow-dot" />{copy.watermarkEyebrow}</p>
              <h2 id="watermark-title">{copy.watermarkTitle}</h2>
              <p className="section-lede">{copy.watermarkBody}</p>
              <div className="watermark-modes"><span><i className="mode-fast" />{copy.watermarkFast}</span><span><i className="mode-ai" />{copy.watermarkAI}</span></div>
            </div>
          </div>
        </section>

        <section className="platform-section section-pad" id="platforms" aria-labelledby="platform-title">
          <div className="shell">
            <div className="platform-heading">
              <div>
                <SectionMarker>{copy.sectionPlatforms}</SectionMarker>
                <h2 id="platform-title">{copy.platformsTitle}</h2>
              </div>
              <p className="section-lede">{copy.platformsBody}</p>
            </div>
            <div className="platform-ledger">
              <a className="platform-row" href={RELEASES} rel="noreferrer" target="_blank">
                <span className="platform-number">01</span><span className="platform-name">{copy.platformMac}</span><span className="platform-detail">{copy.platformMacDetail}</span><span className="platform-action">{copy.releaseButton}<ExternalMark /></span>
              </a>
              <a className="platform-row" href={RELEASES} rel="noreferrer" target="_blank">
                <span className="platform-number">02</span><span className="platform-name">{copy.platformWindows}</span><span className="platform-detail">{copy.platformWindowsDetail}</span><span className="platform-action">{copy.releaseButton}<ExternalMark /></span>
              </a>
              <a className="platform-row" href={RELEASES} rel="noreferrer" target="_blank">
                <span className="platform-number">03</span><span className="platform-name">{copy.platformLinux}</span><span className="platform-detail">{copy.platformLinuxDetail}</span><span className="platform-action">{copy.releaseButton}<ExternalMark /></span>
              </a>
            </div>
            <div className="platform-links"><a href={readme} rel="noreferrer" target="_blank">{copy.readmeLink}<ExternalMark /></a><a href={REPOSITORY} rel="noreferrer" target="_blank">{copy.githubLink}<ExternalMark /></a></div>
          </div>
        </section>

        <section className="final-section" aria-labelledby="final-title">
          <div className="final-tree" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
          <div className="shell final-content">
            <p className="eyebrow"><span className="eyebrow-dot" />{copy.finalEyebrow}</p>
            <h2 id="final-title">{copy.finalTitle}</h2>
            <p>{copy.finalBody}</p>
            <a className="button button-primary" href={RELEASES} rel="noreferrer" target="_blank">{copy.finalCta}<ArrowIcon /></a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-grid">
          <div className="footer-brand"><Brand locale={locale} /><p>{copy.footerMade}</p></div>
          <div className="footer-notes"><p>{copy.footerDisclaimer}</p><p>{copy.footerInterface}</p><a href={REPOSITORY} rel="noreferrer" target="_blank">wangzi6224 / bili-downloader <ExternalMark /></a></div>
          <div className="footer-bottom"><span>© 2026 BILI DOWNLOADER</span><Link href={english ? '/' : '/en/'} lang={english ? 'zh-CN' : 'en'}>{english ? '简体中文' : 'English'} ↗</Link><span>MADE FOR LOCAL USE</span></div>
        </div>
      </footer>
    </>
  );
}
