"use client";

import { useTheme } from "@context/ThemeProvider";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useRef } from "react";

const LINES = 48;
const SPEED = 0.4;
const MAX_DPR = 1.5;
const FADE_DISTANCE = 640;
const STATIC_TIME = 12;

const VERTEX = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDpr;
uniform vec3 uColor;
uniform vec3 uBackground;

float hash(vec2 v) {
  return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * ${SPEED};
  float threads = 0.0;
  float body = 0.0;

  for (int i = 0; i < ${LINES}; i++) {
    float k = float(i) / ${LINES - 1}.0;
    float phase = k * 6.2831;
    float spread = k - 0.5;

    float a1 = 0.26 + 0.06 * sin(t * 0.21 + phase);
    float f1 = 1.3 + 0.4 * k;
    float s1 = p.x * f1 + t * 0.3 + k * 2.2;
    float f2 = 2.8 - 0.7 * k;
    float s2 = p.x * f2 - t * 0.24 + k * 4.1;
    float s3 = p.x * 1.1 + t * 0.17;

    float y = spread * (0.75 + 0.4 * sin(s3)) + a1 * sin(s1) + 0.11 * sin(s2) - 0.12 * p.x;
    float dy = spread * 0.44 * cos(s3) + a1 * f1 * cos(s1) + 0.11 * f2 * cos(s2) - 0.12;

    float d = abs(p.y - y) / sqrt(1.0 + dy * dy) * uResolution.y / uDpr;
    float wave = 0.5 + 0.5 * sin(s1 * 0.7 + phase);
    float shade = 0.3 + 0.7 * wave * wave;

    threads += (1.0 - smoothstep(0.15, 0.95, d)) * shade;
    body += exp(-d * 0.05) * shade;
  }

  float band = 0.5 + 0.5 * sin(p.x * 1.2 - p.y * 2.2 + t * 0.35);
  float sheen = band * band * band * band;
  float silk = threads * 0.4 * (0.35 + 0.65 * sheen) + body * 0.04 * (0.2 + sheen);
  float grain = hash(floor(gl_FragCoord.xy / uDpr)) - 0.5;
  float fade = mix(0.4, 1.0, smoothstep(0.08, 0.58, gl_FragCoord.x / uResolution.x));
  float a = clamp(min(silk, 1.0) * (1.0 + grain * 0.35), 0.0, 1.0) * 0.75 * fade;
  gl_FragColor = vec4(mix(uBackground, uColor, a), 1.0);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
};

const createProgram = (gl: WebGLRenderingContext) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGLRenderingContext.useProgram is a GL call, not a React hook.
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return program;
};

const readToken = (name: string) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map((channel) => Number(channel) / 255);

export default function LiquidLines() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, FADE_DISTANCE], [1, 0]);

  useMotionValueEvent(opacity, "change", (value) => {
    visibleRef.current = value > 0;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", {
      alpha: false,
      antialias: false,
    });
    const program = gl && createProgram(gl);
    if (!canvas || !gl || !program) return;

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uDpr = gl.getUniformLocation(program, "uDpr");
    const [r, g, b] = readToken("--ink-strong");
    gl.uniform3f(gl.getUniformLocation(program, "uColor"), r, g, b);
    const [br, bg, bb] = readToken("--surface-deep");
    gl.uniform3f(gl.getUniformLocation(program, "uBackground"), br, bg, bb);

    const draw = (seconds: number) => {
      if (!canvas.width || !canvas.height) return;
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
      if (reduceMotion) draw(STATIC_TIME);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

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
      observer.disconnect();
      gl.deleteBuffer(gl.getParameter(gl.ARRAY_BUFFER_BINDING));
      gl.deleteProgram(program);
    };
  }, [theme, reduceMotion]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 bg-surface-deep"
      style={{ opacity }}
    >
      <canvas ref={canvasRef} className="size-full" />
    </motion.div>
  );
}
