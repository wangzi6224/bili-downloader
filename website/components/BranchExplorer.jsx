'use client';

import { useState } from 'react';
import { branches, siteCopy } from '../lib/site-content';

const leaves = {
  zh: [
    { id: 'quality', label: '画质 / 编码' },
    { id: 'container', label: 'MP4 / MKV' },
    { id: 'subtitle', label: '字幕 .srt' },
    { id: 'danmaku', label: '弹幕 .ass / .xml' },
    { id: 'chapter', label: '章节' },
    { id: 'metadata', label: '封面 / NFO' },
  ],
  en: [
    { id: 'quality', label: 'Quality / codec' },
    { id: 'container', label: 'MP4 / MKV' },
    { id: 'subtitle', label: 'Subtitles .srt' },
    { id: 'danmaku', label: 'Danmaku .ass / .xml' },
    { id: 'chapter', label: 'Chapters' },
    { id: 'metadata', label: 'Cover / NFO' },
  ],
};

export default function BranchExplorer({ locale }) {
  const [activeId, setActiveId] = useState('collections');
  const copy = siteCopy[locale];
  const active = branches.find((branch) => branch.id === activeId) || branches[2];
  const detail = active[locale];

  return (
    <div className="branch-explorer">
      <div className="explorer-topline">
        <span className="explorer-kicker">{copy.visualKicker}</span>
        <span className="demo-label"><span className="demo-dot" />{copy.demoLabel}</span>
      </div>

      <div className="root-node">
        <span className="root-node-mark" aria-hidden="true">↳</span>
        <span className="root-node-copy">
          <span className="root-node-label">{locale === 'zh' ? '链接根节点' : 'LINK ROOT'}</span>
          <code>www.bilibili.com/video/BV…</code>
        </span>
        <span className="root-node-index">00</span>
      </div>

      <div className="branch-area">
        <p className="node-section-label">
          <span>{locale === 'zh' ? '展开可选内容' : 'EXPAND THE SOURCE'}</span>
          <span>08 {locale === 'zh' ? '种入口' : 'TYPES'}</span>
        </p>
        <ul className="branch-list" aria-label={locale === 'zh' ? 'B站内容类型分支' : 'Bilibili content branches'}>
          {branches.map((branch, index) => {
            const text = branch[locale];
            const selected = branch.id === activeId;
            return (
              <li className="branch-item" key={branch.id}>
                <button
                  aria-pressed={selected}
                  className={'branch-button' + (selected ? ' is-active' : '')}
                  onClick={() => setActiveId(branch.id)}
                  type="button"
                >
                  <span className="branch-node" aria-hidden="true" />
                  <span className="branch-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="branch-name">{text.name}</span>
                  <span className="branch-token">{branch.token}</span>
                  <span className="branch-chevron" aria-hidden="true">↗</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="leaf-area" aria-label={locale === 'zh' ? '可选附加内容' : 'Optional extras'}>
        <div className="leaf-heading">
          <span className="leaf-heading-stem" aria-hidden="true" />
          <span>{locale === 'zh' ? '沿途可选 · 附加内容' : 'OPTIONAL LEAVES · EXTRAS'}</span>
        </div>
        <ul className="leaf-list">
          {leaves[locale].map((leaf, index) => (
            <li key={leaf.id} className="leaf-chip">
              <span className="leaf-index">{String(index + 1).padStart(2, '0')}</span>
              {leaf.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="result-node" aria-live="polite">
        <div className="result-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M5.5 9.5h8l2.2 2.4h10.8v12.6H5.5V9.5Z" />
            <path d="M5.5 12h21v12.5h-21z" />
            <path d="M12 18.2h8M16 15.8v4.8" />
          </svg>
        </div>
        <div className="result-copy">
          <span className="result-label">{locale === 'zh' ? '落到本地' : 'LANDS LOCALLY'}</span>
          <strong>{detail.name}</strong>
          <p>{detail.detail}</p>
          <code>{detail.path}</code>
        </div>
        <span className="result-arrow" aria-hidden="true">↓</span>
      </div>
      <p className="path-note">{locale === 'zh' ? '示例路径 · 命名模板可自定义' : 'Example path · naming templates are customizable'}</p>
    </div>
  );
}
