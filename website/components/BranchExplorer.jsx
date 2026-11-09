'use client';

import { useEffect, useRef, useState } from 'react';
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

function cubicPoints(start, controlOne, controlTwo, end, steps = 22) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlOne.x + 3 * inverse * t ** 2 * controlTwo.x + t ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlOne.y + 3 * inverse * t ** 2 * controlTwo.y + t ** 3 * end.y,
    };
  });
}

function linePoints(graphics, points) {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
}

function pointOnPath(points, progress) {
  const distances = [];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    length += distance;
    distances.push({ index, distance, end: length });
  }

  const target = length * progress;
  const segment = distances.find((item) => item.end >= target) || distances.at(-1);
  if (!segment) return points[0];
  const start = points[segment.index - 1];
  const end = points[segment.index];
  const segmentStart = segment.end - segment.distance;
  const segmentProgress = segment.distance ? (target - segmentStart) / segment.distance : 0;
  return {
    x: start.x + (end.x - start.x) * segmentProgress,
    y: start.y + (end.y - start.y) * segmentProgress,
  };
}

function centerOf(element, parentRect) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - parentRect.left + rect.width / 2,
    y: rect.top - parentRect.top + rect.height / 2,
  };
}

export default function BranchExplorer({ locale }) {
  const [activeId, setActiveId] = useState('collections');
  const [selectedLeaves, setSelectedLeaves] = useState(['quality', 'subtitle', 'chapter']);
  const [pixiReady, setPixiReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const explorerRef = useRef(null);
  const canvasHostRef = useRef(null);
  const rootRef = useRef(null);
  const leafAreaRef = useRef(null);
  const resultRef = useRef(null);
  const pixiRef = useRef(null);
  const copy = siteCopy[locale];
  const active = branches.find((branch) => branch.id === activeId) || branches[2];
  const detail = active[locale];
  const localizedLeaves = leaves[locale];
  const selectedLabels = selectedLeaves
    .map((id) => localizedLeaves.find((leaf) => leaf.id === id)?.label)
    .filter(Boolean);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduceMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let app;

    async function createCanvas() {
      try {
        const [{ Application, Graphics }, gsapModule] = await Promise.all([
          import('pixi.js'),
          import('gsap'),
        ]);
        if (cancelled || !canvasHostRef.current) return;

        app = new Application();
        await app.init({
          width: Math.max(1, explorerRef.current?.clientWidth || 1),
          height: Math.max(1, explorerRef.current?.clientHeight || 1),
          antialias: true,
          autoDensity: true,
          autoStart: false,
          backgroundAlpha: 0,
          preference: 'webgl',
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });

        if (cancelled || !canvasHostRef.current) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }

        app.canvas.setAttribute('aria-hidden', 'true');
        app.canvas.className = 'branch-canvas';
        canvasHostRef.current.appendChild(app.canvas);
        const track = new Graphics();
        const particle = new Graphics();
        app.stage.addChild(track, particle);
        pixiRef.current = { app, gsap: gsapModule.gsap, track, particle };
        setPixiReady(true);
      } catch {
        // The DOM tree and its connectors remain the accessible fallback.
      }
    }

    createCanvas();
    return () => {
      cancelled = true;
      pixiRef.current = null;
      if (app) app.destroy({ removeView: true }, { children: true });
    };
  }, []);

  useEffect(() => {
    if (!pixiReady || !pixiRef.current || !explorerRef.current) return undefined;

    let { app, track, particle } = pixiRef.current;
    let motionTimeline;
    let resizeObserver;
    const explorer = explorerRef.current;
    let mainPoints = [];

    const draw = () => {
      if (!pixiRef.current || !explorerRef.current) return;
      app = pixiRef.current.app;
      track = pixiRef.current.track;
      particle = pixiRef.current.particle;
      app.renderer.resize(Math.max(1, explorer.clientWidth), Math.max(1, explorer.clientHeight));

      const parentRect = explorerRef.current.getBoundingClientRect();
      const rootRect = rootRef.current?.getBoundingClientRect();
      const activeButton = explorerRef.current.querySelector(`[data-branch-id="${activeId}"]`);
      const activeNode = activeButton?.querySelector('.branch-node');
      const branchPoint = centerOf(activeNode || activeButton, parentRect);
      const resultRect = resultRef.current?.getBoundingClientRect();
      const leafHeading = leafAreaRef.current?.querySelector('.leaf-heading-stem');

      if (!rootRect || !branchPoint || !resultRect || !leafHeading) return;

      const rootPoint = {
        x: rootRect.left - parentRect.left + rootRect.width / 2,
        y: rootRect.bottom - parentRect.top,
      };
      const hub = centerOf(leafHeading, parentRect);
      const resultPoint = {
        x: resultRect.left - parentRect.left + 11,
        y: resultRect.top - parentRect.top,
      };

      const rootToBranch = cubicPoints(
        rootPoint,
        { x: rootPoint.x, y: rootPoint.y + 25 },
        { x: branchPoint.x, y: branchPoint.y - 28 },
        branchPoint,
      );
      const branchToHub = cubicPoints(
        branchPoint,
        { x: branchPoint.x, y: branchPoint.y + 43 },
        { x: hub.x + (branchPoint.x - hub.x) * 0.22, y: hub.y - 20 },
        hub,
      );
      const hubToResult = cubicPoints(
        hub,
        { x: hub.x, y: hub.y + 22 },
        { x: resultPoint.x + 12, y: resultPoint.y - 24 },
        resultPoint,
      );
      mainPoints = [...rootToBranch, ...branchToHub.slice(1), ...hubToResult.slice(1)];

      track.clear();
      linePoints(track, mainPoints);
      track.stroke({ color: 0xff5b9b, alpha: 0.3, width: 1.6, cap: 'round', join: 'round' });

      const chips = selectedLeaves
        .map((id) => explorerRef.current.querySelector(`[data-leaf-id="${id}"]`))
        .filter(Boolean);
      chips.forEach((chip) => {
        const leafPoint = centerOf(chip, parentRect);
        const branch = cubicPoints(
          hub,
          { x: hub.x + 18, y: hub.y + 8 },
          { x: leafPoint.x - (leafPoint.x - hub.x) * 0.25, y: leafPoint.y },
          leafPoint,
          12,
        );
        linePoints(track, branch);
        track.stroke({ color: 0x8de7ca, alpha: 0.42, width: 1.1, cap: 'round', join: 'round' });
        track.circle(leafPoint.x, leafPoint.y, 2.1).fill({ color: 0x8de7ca, alpha: 0.8 });
      });

      particle.clear();
      const firstPoint = mainPoints[0];
      particle.circle(0, 0, 7).fill({ color: 0xff5b9b, alpha: 0.12 });
      particle.circle(0, 0, 3.5).fill({ color: 0xff5b9b, alpha: 0.5 });
      particle.circle(0, 0, 1.8).fill({ color: 0xffedf4, alpha: 1 });
      particle.position.set(firstPoint.x, firstPoint.y);

      particle.visible = false;
      app.render();
    };

    const gsap = pixiRef.current.gsap;
    let context;
    const animatePath = () => {
      motionTimeline?.kill();
      context?.revert();
      draw();
      context = gsap.context(() => {
        if (reduceMotion) {
          particle.visible = false;
          app.render();
          return;
        }

        const progress = { value: 0 };
        particle.visible = true;
        motionTimeline = gsap.timeline({ onUpdate: () => {
          const point = pointOnPath(mainPoints, progress.value);
          particle.position.set(point.x, point.y);
          app.render();
        } });
        motionTimeline.to(progress, { value: 1, duration: 0.95, ease: 'power2.inOut' });
        const activeButton = explorerRef.current.querySelector(`[data-branch-id="${activeId}"]`);
        const resultNode = resultRef.current;
        if (activeButton) {
          motionTimeline.fromTo(activeButton, { scale: 0.985 }, { scale: 1, duration: 0.2, ease: 'power2.out', clearProps: 'scale' }, 0.48);
        }
        if (resultNode) {
          motionTimeline.fromTo(resultNode, { y: 7, autoAlpha: 0.72 }, { y: 0, autoAlpha: 1, duration: 0.32, ease: 'power2.out', clearProps: 'transform,opacity,visibility' }, 0.62);
        }
      }, explorer);
    };
    animatePath();
    let previousWidth = explorer.clientWidth;
    let previousHeight = explorer.clientHeight;
    resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (Math.abs(width - previousWidth) < 1 && Math.abs(height - previousHeight) < 1) return;
      previousWidth = width;
      previousHeight = height;
      animatePath();
    });
    resizeObserver.observe(explorer);

    return () => {
      resizeObserver?.disconnect();
      motionTimeline?.kill();
      context?.revert();
    };
  }, [activeId, selectedLeaves, pixiReady, reduceMotion]);

  const toggleLeaf = (id) => {
    setSelectedLeaves((current) => current.includes(id)
      ? current.filter((leafId) => leafId !== id)
      : [...current, id]);
  };

  const pathLabel = selectedLabels.length ? selectedLabels.join(' · ') : copy.noExtras;

  return (
    <div className="branch-explorer" ref={explorerRef} role="group" aria-label={copy.demoGroupLabel}>
      <div className="branch-canvas-layer" ref={canvasHostRef} aria-hidden="true" />
      <div className="explorer-topline">
        <span className="explorer-kicker">{copy.visualKicker}</span>
        <span className="demo-label"><span className="demo-dot" />{copy.demoLabel}</span>
      </div>

      <div className="root-node" ref={rootRef}>
        <span className="root-node-mark" aria-hidden="true">↳</span>
        <span className="root-node-copy">
          <span className="root-node-label">{locale === 'zh' ? '链接根节点' : 'LINK ROOT'}</span>
          <code>www.bilibili.com/video/BV…</code>
        </span>
        <span className="root-node-index">↳</span>
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
                  data-branch-id={branch.id}
                  onClick={() => setActiveId(branch.id)}
                  type="button"
                >
                  <span className="branch-node" aria-hidden="true" />
                  <span className="branch-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="branch-name">{text.name}</span>
                  <span className="branch-token">{branch.token[locale]}</span>
                  <span className="branch-chevron" aria-hidden="true">↗</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="leaf-area" ref={leafAreaRef}>
        <div className="leaf-heading">
          <span className="leaf-heading-stem" aria-hidden="true" />
          <span>{locale === 'zh' ? '沿途可选 · 附加内容' : 'OPTIONAL LEAVES · EXTRAS'}</span>
          <span className="leaf-count">{selectedLeaves.length} / 6</span>
        </div>
        <ul className="leaf-list" aria-label={locale === 'zh' ? '可选附加内容' : 'Optional extras'}>
          {localizedLeaves.map((leaf, index) => {
            const selected = selectedLeaves.includes(leaf.id);
            return (
              <li key={leaf.id}>
                <button
                  aria-pressed={selected}
                  className={'leaf-chip' + (selected ? ' is-selected' : '')}
                  data-leaf-id={leaf.id}
                  onClick={() => toggleLeaf(leaf.id)}
                  type="button"
                >
                  <span className="leaf-index">{String(index + 1).padStart(2, '0')}</span>
                  <span>{leaf.label}</span>
                  <span className="leaf-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="result-node" ref={resultRef} aria-live="polite" aria-atomic="true">
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
          <span className="result-extras"><b>{copy.extrasSelected}</b>{pathLabel}</span>
          <code>{detail.path}</code>
        </div>
        <span className="result-arrow" aria-hidden="true">↓</span>
      </div>
      <p className="path-note">{locale === 'zh' ? '示例路径 · 命名模板可自定义；此演示不会解析或下载' : 'Example path · templates are customizable; this demo does not parse or download'}</p>
    </div>
  );
}
