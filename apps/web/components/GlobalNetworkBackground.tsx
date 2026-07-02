"use client";

import { useTheme } from "@context/ThemeProvider";
import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  r: number;
  flash: number;
};

type Pulse = {
  from: number;
  to: number;
  progress: number;
  speed: number;
  delayMs: number;
  phase: number;
};

const config = {
  nodeDensity: 13500,
  nodeMin: 46,
  nodeMax: 72,
  linkDistanceScale: 0.34,
  nodeRadius: { min: 2.2, max: 3.4 },
  pulseMin: 8,
  pulseMax: 14,
  pulseSpeed: { min: 0.00016, max: 0.00028 },
  pulseDelayMs: { min: 520, max: 1800 },
  pulseRadius: 1.35,
  pulseGlowRadius: 20,
  pulseTrail: 72,
  pulseTrailWidth: 1.6,
  pulseTrailAlpha: 0.28,
  flashFade: 2.8,
};

// Theme-aware canvas colors. `line`/`accent` are bare "r, g, b" triples so we
// can compose arbitrary alpha stops; `node` is a full rgba. In dark mode we use
// additive ("lighter") blending for glowing pulses on black; in light mode we
// switch to normal blending with darker slate inks so they read on white.
const CANVAS_PALETTES = {
  dark: {
    line: "109, 109, 109",
    accent: "216, 216, 216",
    node: "rgba(48, 48, 48, 0.95)",
    nodeGlow: 0.12,
    pulseComposite: "lighter" as GlobalCompositeOperation,
  },
  light: {
    // Very soft, light slate so the network reads as a faint texture on light
    // surfaces rather than obvious dark specks.
    line: "203, 213, 225",
    accent: "203, 213, 225",
    node: "rgba(203, 213, 225, 0.4)",
    nodeGlow: 0.03,
    pulseComposite: "source-over" as GlobalCompositeOperation,
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const shuffle = <T,>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const pickRandomNode = (count: number, exclude?: number) => {
  if (count <= 1) return 0;
  let candidate = Math.floor(Math.random() * count);
  while (exclude !== undefined && candidate === exclude) {
    candidate = Math.floor(Math.random() * count);
  }
  return candidate;
};

export default function GlobalNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotionRef = useRef(false);
  const { theme } = useTheme();
  // Current theme, read inside the animation loop so a theme toggle updates the
  // palette without tearing down and rebuilding the whole node graph / RAF loop.
  const themeRef = useRef(theme);
  // One-shot redraw exposed by the setup effect, used to repaint immediately on
  // theme change when the loop is paused (reduced motion / hidden tab).
  const redrawRef = useRef<(() => void) | null>(null);

  // Keep the palette in sync on theme change and repaint once, without re-running
  // the heavy setup effect below.
  useEffect(() => {
    themeRef.current = theme;
    redrawRef.current?.();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let palette = CANVAS_PALETTES[themeRef.current];

    let width = 0;
    let height = 0;
    let linkDistance = 0;
    let animationFrame = 0;
    let lastTime = 0;
    let paused = false;

    const nodes: Node[] = [];
    const neighbors: number[][] = [];
    const pulses: Pulse[] = [];

    const pickLinkedPair = (excludeFrom?: number) => {
      const linkedNodes = neighbors
        .map((items, index) => ({ index, items }))
        .filter(
          ({ index, items }) =>
            items.length > 0 &&
            (excludeFrom === undefined || index !== excludeFrom),
        );

      if (linkedNodes.length === 0) {
        const from = pickRandomNode(nodes.length, excludeFrom);
        const to = pickRandomNode(nodes.length, from);
        return { from, to };
      }

      const source =
        linkedNodes[Math.floor(Math.random() * linkedNodes.length)];
      const to = source.items[Math.floor(Math.random() * source.items.length)];
      return { from: source.index, to };
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    reduceMotionRef.current = prefersReducedMotion.matches;

    const updateReducedMotion = () => {
      reduceMotionRef.current = prefersReducedMotion.matches;
      if (reduceMotionRef.current) {
        stop();
        renderFrame(0);
      } else {
        start();
      }
    };

    if (prefersReducedMotion.addEventListener) {
      prefersReducedMotion.addEventListener("change", updateReducedMotion);
    } else {
      prefersReducedMotion.addListener(updateReducedMotion);
    }

    const handleVisibility = () => {
      paused = document.hidden;
      if (!paused && !reduceMotionRef.current) {
        lastTime = performance.now();
        animationFrame = requestAnimationFrame(loop);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    const resetNodes = () => {
      nodes.length = 0;
      neighbors.length = 0;
      const area = width * height;
      const count = clamp(
        Math.round(area / config.nodeDensity),
        config.nodeMin,
        config.nodeMax,
      );
      const aspect = width / height;
      const cols = Math.ceil(Math.sqrt(count * aspect));
      const rows = Math.ceil(count / cols);
      const cellWidth = width / cols;
      const cellHeight = height / rows;
      const totalCells = rows * cols;
      const cellIndices = shuffle(
        Array.from({ length: totalCells }, (_, index) => index),
      );
      for (let i = 0; i < count; i += 1) {
        const cellIndex = cellIndices[i];
        const row = Math.floor(cellIndex / cols);
        const col = cellIndex % cols;
        const jitterX = rand(-cellWidth * 0.35, cellWidth * 0.35);
        const jitterY = rand(-cellHeight * 0.35, cellHeight * 0.35);
        const x = clamp((col + 0.5) * cellWidth + jitterX, 0, width);
        const y = clamp((row + 0.5) * cellHeight + jitterY, 0, height);
        nodes.push({
          x,
          y,
          r: rand(config.nodeRadius.min, config.nodeRadius.max),
          flash: 0,
        });
        neighbors.push([]);
      }
    };

    const resetPulses = () => {
      pulses.length = 0;
      const count = clamp(
        Math.round(nodes.length / 8),
        config.pulseMin,
        config.pulseMax,
      );
      for (let i = 0; i < count; i += 1) {
        const pair = pickLinkedPair();
        pulses.push({
          from: pair.from,
          to: pair.to,
          progress: Math.random(),
          speed: rand(config.pulseSpeed.min, config.pulseSpeed.max),
          delayMs: rand(0, config.pulseDelayMs.max),
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      linkDistance = Math.min(width, height) * config.linkDistanceScale;
      resetNodes();
      buildNeighbors();
      resetPulses();
      if (reduceMotionRef.current) {
        renderFrame(0);
      }
    };

    const buildNeighbors = () => {
      for (let i = 0; i < neighbors.length; i += 1) {
        neighbors[i].length = 0;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDistance) {
            neighbors[i].push(j);
            neighbors[j].push(i);
          }
        }
      }
    };

    const updateNodes = (dt: number) => {
      for (const node of nodes) {
        node.flash = Math.max(0, node.flash - dt * config.flashFade);
      }
    };

    const updatePulses = (dtMs: number) => {
      for (const pulse of pulses) {
        if (pulse.delayMs > 0) {
          pulse.delayMs = Math.max(0, pulse.delayMs - dtMs);
          continue;
        }
        pulse.progress += pulse.speed * dtMs;
        if (pulse.progress >= 1) {
          pulse.progress = 0;
          const arrived = pulse.to;
          nodes[arrived].flash = 1;
          const nextNeighbors = neighbors[arrived].filter(
            (index) => index !== pulse.from,
          );
          const nextTo =
            nextNeighbors.length > 0
              ? nextNeighbors[Math.floor(Math.random() * nextNeighbors.length)]
              : pickLinkedPair(arrived).to;
          pulse.from = arrived;
          pulse.to = nextTo;
          pulse.speed = rand(config.pulseSpeed.min, config.pulseSpeed.max);
          pulse.delayMs = rand(
            config.pulseDelayMs.min,
            config.pulseDelayMs.max,
          );
        }
      }
    };

    const drawLinks = (offsetX: number, offsetY: number) => {
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDistance) {
            const alpha = (1 - dist / linkDistance) * 0.7;
            const gradient = ctx.createLinearGradient(
              nodes[i].x + offsetX,
              nodes[i].y + offsetY,
              nodes[j].x + offsetX,
              nodes[j].y + offsetY,
            );
            gradient.addColorStop(0, `rgba(${palette.line}, 0)`);
            gradient.addColorStop(0.5, `rgba(${palette.line}, 0.24)`);
            gradient.addColorStop(1, `rgba(${palette.line}, 0)`);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x + offsetX, nodes[i].y + offsetY);
            ctx.lineTo(nodes[j].x + offsetX, nodes[j].y + offsetY);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawPulses = (offsetX: number, offsetY: number) => {
      ctx.save();
      ctx.globalCompositeOperation = palette.pulseComposite;
      for (const pulse of pulses) {
        if (pulse.delayMs > 0) continue;
        const from = nodes[pulse.from];
        const to = nodes[pulse.to];
        const eased =
          pulse.progress * pulse.progress * (3 - 2 * pulse.progress);
        const x = from.x + (to.x - from.x) * eased + offsetX;
        const y = from.y + (to.y - from.y) * eased + offsetY;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const trailLength = Math.min(config.pulseTrail, length * eased);
        const trailX = x - ux * trailLength;
        const trailY = y - uy * trailLength;

        const trailGradient = ctx.createLinearGradient(trailX, trailY, x, y);
        trailGradient.addColorStop(0, `rgba(${palette.accent}, 0)`);
        trailGradient.addColorStop(
          0.72,
          `rgba(${palette.accent}, ${config.pulseTrailAlpha * 0.45})`,
        );
        trailGradient.addColorStop(
          1,
          `rgba(${palette.accent}, ${config.pulseTrailAlpha})`,
        );
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = config.pulseTrailWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(x, y);
        ctx.stroke();

        const glow = ctx.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          config.pulseGlowRadius,
        );
        glow.addColorStop(0, `rgba(${palette.accent}, 0.18)`);
        glow.addColorStop(0.45, `rgba(${palette.accent}, 0.08)`);
        glow.addColorStop(1, `rgba(${palette.accent}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, config.pulseGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        const pulseBreath =
          0.86 + Math.sin(pulse.phase + pulse.progress * Math.PI * 2) * 0.14;
        ctx.fillStyle = `rgba(${palette.accent}, 0.7)`;
        ctx.beginPath();
        ctx.arc(x, y, config.pulseRadius * pulseBreath, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawNodes = (offsetX: number, offsetY: number) => {
      for (const node of nodes) {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        const glowStrength = node.flash;
        const glowRadius = node.r * 5;
        const nodeGlow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        nodeGlow.addColorStop(
          0,
          `rgba(${palette.accent}, ${palette.nodeGlow})`,
        );
        nodeGlow.addColorStop(1, `rgba(${palette.accent}, 0)`);
        ctx.fillStyle = nodeGlow;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.node;
        ctx.beginPath();
        ctx.arc(x, y, node.r, 0, Math.PI * 2);
        ctx.fill();

        if (glowStrength > 0.01) {
          ctx.globalAlpha = Math.min(0.28, glowStrength * 0.28);
          ctx.fillStyle = `rgba(${palette.accent}, 0.24)`;
          ctx.beginPath();
          ctx.arc(x, y, node.r * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    };

    const renderFrame = (dtMs: number) => {
      // Re-read the palette each frame so theme changes apply without rebuilding.
      palette = CANVAS_PALETTES[themeRef.current];
      ctx.clearRect(0, 0, width, height);
      const offsetX = 0;
      const offsetY = 0;

      drawLinks(offsetX, offsetY);

      if (!reduceMotionRef.current) {
        updatePulses(dtMs);
        drawPulses(offsetX, offsetY);
      }

      drawNodes(offsetX, offsetY);
    };

    const loop = (time: number) => {
      if (paused || reduceMotionRef.current) return;
      const dtMs = Math.min(time - lastTime, 48);
      lastTime = time;
      const dt = dtMs / 1000;
      updateNodes(dt);
      renderFrame(dtMs);
      animationFrame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (animationFrame) return;
      lastTime = performance.now();
      animationFrame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    // Coalesce resize bursts into a single rebuild per frame — `resize`
    // regenerates the O(n²) neighbor graph, so running it on every raw resize
    // event thrashes during a drag-resize.
    let resizeFrame = 0;
    const handleResize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
      });
    };

    // Expose a one-shot redraw so the theme-sync effect can repaint immediately
    // when the animation loop is paused (reduced motion / hidden tab).
    redrawRef.current = () => renderFrame(0);

    window.addEventListener("resize", handleResize);
    resize();
    if (!reduceMotionRef.current) {
      start();
    }

    return () => {
      stop();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      redrawRef.current = null;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (prefersReducedMotion.removeEventListener) {
        prefersReducedMotion.removeEventListener("change", updateReducedMotion);
      } else {
        prefersReducedMotion.removeListener(updateReducedMotion);
      }
    };
    // Setup runs once; theme changes are handled via themeRef + the sync effect
    // above so we never rebuild the node graph / RAF loop on a theme toggle.
  }, []);

  return (
    <div className="bg-surface-deep" aria-hidden="true">
      <div className="bg-surface-deep" />
      <canvas ref={canvasRef} className="global-network-canvas" />
      <div className="bg-surface-deep" />
    </div>
  );
}
