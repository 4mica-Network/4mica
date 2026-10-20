"use client";

import { useTheme } from "@context/ThemeProvider";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

const MAX_DPR = 1.5;
const STATIC_TIME = 12;
const MIN_BRIGHTNESS = 0.03;
const SHIMMER_SPEED = 0.28;
const TAU = Math.PI * 2;

type GlyphSonarProps = {
  ambient?: number;
  density?: number;
  glyphSize?: number;
  className?: string;
};

const readToken = (name: string) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map(Number);

const rgba = ([r, g, b]: number[], alpha: number) =>
  `rgba(${r},${g},${b},${alpha.toFixed(3)})`;

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y + 0x9e3779b9, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

const fade = (t: number) => t * t * (3 - 2 * t);

const valueNoise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * fx;
  const bottom =
    hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * fx;
  return top + (bottom - top) * fy;
};

const smoothstep = (edge0: number, edge1: number, value: number) =>
  fade(Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))));

const shoalAt = (x: number, y: number, threshold: number) => {
  const coarse = valueNoise(x / 96, y / 96);
  const fine = valueNoise(x / 44 + 17, y / 44 + 31);
  return smoothstep(
    threshold - 0.1,
    threshold + 0.14,
    coarse * 0.65 + fine * 0.35,
  );
};

const drawGlyph = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brightness: number,
  ink: number[],
) => {
  const alpha = Math.min(1, 0.06 + brightness * 0.8);
  if (brightness < 0.3) {
    ctx.fillStyle = rgba(ink, alpha);
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    return;
  }
  if (brightness < 0.6) {
    ctx.fillStyle = rgba(ink, alpha);
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = rgba(ink, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (brightness < 0.8) {
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x + 2, y);
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x, y + 2);
  } else {
    ctx.arc(x, y, 2.2, 0, TAU);
  }
  ctx.stroke();
};

export default function GlyphSonar({
  ambient = 0.35,
  density = 0.5,
  glyphSize = 11,
  className,
}: GlyphSonarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const ink = readToken("--ink-strong");
    const threshold = 0.74 - density * 0.32;

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let shoals = new Float32Array(0);
    let phases = new Float32Array(0);

    const draw = (seconds: number) => {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          const shoal = shoals[index];
          if (shoal <= 0) continue;
          const phase = phases[index];
          const slow = Math.sin(seconds * SHIMMER_SPEED + phase);
          const slower = Math.sin(seconds * SHIMMER_SPEED * 0.37 + phase * 2);
          const shimmer = 0.5 + 0.3 * slow + 0.2 * slower;
          const brightness = ambient * shoal * (0.4 + 1.2 * shimmer);
          if (brightness >= MIN_BRIGHTNESS) {
            drawGlyph(
              ctx,
              (col + 0.5) * glyphSize,
              (row + 0.5) * glyphSize,
              brightness,
              ink,
            );
          }
        }
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / glyphSize);
      rows = Math.ceil(height / glyphSize);
      shoals = new Float32Array(cols * rows);
      phases = new Float32Array(cols * rows);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          shoals[index] = shoalAt(
            (col + 0.5) * glyphSize,
            (row + 0.5) * glyphSize,
            threshold,
          );
          phases[index] = hash(col + 977, row + 311) * TAU;
        }
      }
      if (reduceMotion) draw(STATIC_TIME);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
    });
    intersectionObserver.observe(canvas);

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (visibleRef.current && !document.hidden) {
        draw(STATIC_TIME + (now - start) / 1000);
      }
      frame = requestAnimationFrame(loop);
    };
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [theme, reduceMotion, ambient, density, glyphSize]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
