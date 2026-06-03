"use client";

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
};

const config = {
  nodeDensity: 22000,
  nodeMin: 30,
  nodeMax: 30,
  linkDistanceScale: 1.5,
  nodeRadius: { min: 6, max: 7.6 },
  pulseMin: 15,
  pulseMax: 15,
  pulseSpeed: { min: 0.0004, max: 0.0004 },
  pulseDelayMs: { min: 140, max: 220 },
  pulseRadius: 0.9,
  pulseGlowRadius: 8,
  pulseTrail: 22,
  pulseTrailWidth: 0.9,
  pulseTrailAlpha: 0.08,
  flashFade: 6,
  parallaxStrength: 5,
  lineColor: "rgba(120, 140, 160, 0.04)",
  nodeColor: "rgba(150, 170, 190, 0.12)",
  nodeFlash: "rgba(150, 170, 190, 0.18)",
  pulseCore: "rgba(163, 255, 214, 0.28)",
  pulseGlow: "rgba(72, 201, 176, 0.12)",
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
const pickRandomPair = (count: number, excludeFrom?: number) => {
  const from = pickRandomNode(count, excludeFrom);
  const to = pickRandomNode(count, from);
  return { from, to };
};

export default function GlobalNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let linkDistance = 0;
    let animationFrame = 0;
    let lastTime = 0;
    let paused = false;

    const nodes: Node[] = [];
    const neighbors: number[][] = [];
    const pulses: Pulse[] = [];

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
        const pair = pickRandomPair(nodes.length);
        pulses.push({
          from: pair.from,
          to: pair.to,
          progress: Math.random(),
          speed: rand(config.pulseSpeed.min, config.pulseSpeed.max),
          delayMs: rand(0, config.pulseDelayMs.max),
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
          const pair = pickRandomPair(nodes.length, arrived);
          pulse.from = pair.from;
          pulse.to = pair.to;
          pulse.speed = rand(config.pulseSpeed.min, config.pulseSpeed.max);
          pulse.delayMs = rand(
            config.pulseDelayMs.min,
            config.pulseDelayMs.max,
          );
        }
      }
    };

    const drawLinks = (offsetX: number, offsetY: number) => {
      ctx.strokeStyle = config.lineColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDistance) {
            ctx.globalAlpha = (1 - dist / linkDistance) * 0.55;
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
      ctx.globalCompositeOperation = "lighter";
      for (const pulse of pulses) {
        if (pulse.delayMs > 0) continue;
        const from = nodes[pulse.from];
        const to = nodes[pulse.to];
        const x = from.x + (to.x - from.x) * pulse.progress + offsetX;
        const y = from.y + (to.y - from.y) * pulse.progress + offsetY;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const trailX = x - ux * config.pulseTrail;
        const trailY = y - uy * config.pulseTrail;

        const trailGradient = ctx.createLinearGradient(trailX, trailY, x, y);
        trailGradient.addColorStop(0, "rgba(72, 201, 176, 0)");
        trailGradient.addColorStop(
          1,
          `rgba(72, 201, 176, ${config.pulseTrailAlpha})`,
        );
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = config.pulseTrailWidth;
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
        glow.addColorStop(0, config.pulseGlow);
        glow.addColorStop(0.5, "rgba(72, 201, 176, 0.12)");
        glow.addColorStop(1, "rgba(72, 201, 176, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, config.pulseGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = config.pulseCore;
        ctx.beginPath();
        ctx.arc(x, y, config.pulseRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawNodes = (offsetX: number, offsetY: number) => {
      for (const node of nodes) {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        const glowStrength = node.flash;
        const size = node.r * 2;
        ctx.fillStyle = config.nodeColor;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        if (glowStrength > 0.01) {
          ctx.globalAlpha = Math.min(0.3, glowStrength * 0.3);
          ctx.fillStyle = config.nodeFlash;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.globalAlpha = 1;
        }
      }
    };

    const renderFrame = (dtMs: number) => {
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

    window.addEventListener("resize", resize);
    resize();
    if (!reduceMotionRef.current) {
      start();
    }

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (prefersReducedMotion.removeEventListener) {
        prefersReducedMotion.removeEventListener("change", updateReducedMotion);
      } else {
        prefersReducedMotion.removeListener(updateReducedMotion);
      }
    };
  }, []);

  return (
    <div className="global-background" aria-hidden="true">
      <div className="global-bg-base" />
      <canvas ref={canvasRef} className="global-network-canvas" />
      <div className="global-bg-vignette" />
    </div>
  );
}
