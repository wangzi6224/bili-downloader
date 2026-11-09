'use client';

import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import GradientASCII from './GradientASCII';

function createSignalField(app) {
  const paths = new Graphics();
  const nodes = new Graphics();
  const pulse = new Graphics();

  app.stage.addChild(paths, nodes, pulse);
  pulse.circle(0, 0, 2.2).fill({ color: 0xffb4cf, alpha: 0.72 });

  const draw = () => {
    const { width, height } = app.screen;
    paths.clear();
    nodes.clear();

    // Sparse, schematic branches sit at the edges of the composition so the
    // product screenshot and headline remain the focus.
    const branches = [
      [[0.015, 0.22], [0.055, 0.22], [0.09, 0.29], [0.145, 0.29]],
    ];

    branches.forEach((branch, index) => {
      branch.forEach(([x, y], pointIndex) => {
        const px = x * width;
        const py = y * height;
        if (pointIndex === 0) paths.moveTo(px, py);
        else paths.lineTo(px, py);
      });
      paths.stroke({
        width: 0.8,
        color: index < 2 ? 0xff5b9b : 0x8de7ca,
        alpha: 0.14,
      });
    });

    [
      [0.015, 0.22, 1.4], [0.09, 0.29, 2.2], [0.145, 0.29, 1.3],
    ].forEach(([x, y, radius], index) => {
      nodes.circle(x * width, y * height, radius).fill({
        color: index < 3 ? 0xff91bb : 0x8de7ca,
        alpha: index === 1 || index === 4 ? 0.46 : 0.28,
      });
    });
  };

  draw();

  let elapsed = 0;
  const travel = (ticker) => {
    elapsed = (elapsed + ticker.deltaMS * 0.00011) % 1;
    // A small packet moves along a branch and fades before looping.
    pulse.position.set(
      (0.015 + elapsed * 0.13) * app.screen.width,
      (0.22 + elapsed * 0.07) * app.screen.height,
    );
    pulse.alpha = 0.72 * (1 - elapsed);
  };

  app.ticker.maxFPS = 24;
  app.ticker.add(travel);

  return {
    draw,
    destroy() {
      app.ticker.remove(travel);
    },
  };
}

export default function HeroEffects({ children }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvasHost = canvasRef.current;
    if (!stage || !canvasHost) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = gsap.context(() => {
      if (reduceMotion) return;

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline.fromTo('.hero-copy h1',
        { opacity: 0.86, y: 13 },
        { opacity: 1, y: 0, duration: 0.78 },
      );
      timeline.fromTo('.hero-intro, .hero-actions, .hero-meta',
        { opacity: 0.86, y: 9 },
        { opacity: 1, y: 0, duration: 0.64, stagger: 0.1 },
        '-=0.46',
      );
      timeline.fromTo('.hero-product',
        { opacity: 0.94, scale: 0.985, y: 9 },
        { opacity: 1, scale: 1, y: 0, duration: 1.05, ease: 'power2.out' },
        '-=0.7',
      );
    }, stage);

    if (reduceMotion) return () => context.revert();

    let app;
    let field;
    let resizeObserver;
    let appInitialized = false;
    let disposed = false;

    const startField = async () => {
      app = new Application();
      try {
        await app.init({
          resizeTo: stage,
          backgroundAlpha: 0,
          antialias: false,
          autoDensity: true,
          autoStart: false,
          resolution: Math.min(window.devicePixelRatio || 1, 1.5),
          powerPreference: 'low-power',
        });
        appInitialized = true;

        if (disposed) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }

        app.canvas.setAttribute('aria-hidden', 'true');
        canvasHost.appendChild(app.canvas);
        field = createSignalField(app);
        resizeObserver = new ResizeObserver(() => field?.draw());
        resizeObserver.observe(stage);
        app.start();
      } catch {
        // The signal field is decorative; the page stays complete without it.
        if (appInitialized) app?.destroy({ removeView: true }, { children: true });
        app = undefined;
      }
    };

    startField();

    return () => {
      disposed = true;
      context.revert();
      field?.destroy();
      resizeObserver?.disconnect();
      if (appInitialized) app?.destroy({ removeView: true }, { children: true });
    };
  }, []);

  return (
    <div className="hero-stage" ref={stageRef}>
      <div className="hero-ascii-backdrop" aria-hidden="true">
        <GradientASCII
          colors={['#bd2b6a', '#ff5b9b', '#ffc0d7', '#fff4f8']}
          shape="horizon"
          characters=" =+xX0S8#@"
          cellSize={24}
          density={0.8}
          glyphOpacity={0.98}
          gradientOpacity={0.68}
          glow={0.48}
          depthOfField={0}
          flicker={0.03}
          softness={0.68}
          scale={1.04}
          flow={0.18}
          speed={0.14}
          grain={0.03}
          scrambleRadius={0.08}
          clickEffect="wave"
          dpr={1.25}
        />
      </div>
      <div className="hero-signal" ref={canvasRef} aria-hidden="true" />
      {children}
    </div>
  );
}
