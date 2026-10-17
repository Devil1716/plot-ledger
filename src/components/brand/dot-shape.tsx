"use client";

import { useEffect, useRef } from "react";

type Vec = [number, number, number];

const SIDE = 9; // 9×9 grid per face-ish sampling → ~500 points, cheap on mid phones

/** Points on a unit cube surface, a sphere and a twisted plane, all in the same order so they can morph. */
function buildShapes(): Vec[][] {
  const cube: Vec[] = [];
  const steps = SIDE - 1;
  for (let face = 0; face < 6; face += 1) {
    for (let i = 0; i < SIDE; i += 1) {
      for (let j = 0; j < SIDE; j += 1) {
        const a = (i / steps) * 2 - 1;
        const b = (j / steps) * 2 - 1;
        const axis = face % 3;
        const sign = face < 3 ? 1 : -1;
        const p: Vec = axis === 0 ? [sign, a, b] : axis === 1 ? [a, sign, b] : [a, b, sign];
        cube.push(p);
      }
    }
  }
  const sphere = cube.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z) || 1;
    return [(x / len) * 1.25, (y / len) * 1.25, (z / len) * 1.25] as Vec;
  });
  const wave = cube.map(([x, y, z], index) => {
    const u = ((index % SIDE) / steps) * 2 - 1;
    const v = ((Math.floor(index / SIDE) % (SIDE * 6)) / (SIDE * 6 - 1)) * 2 - 1;
    return [u * 1.4, Math.sin(u * 2.4 + v * 3) * 0.35 + (y + z) * 0.05, v * 1.4 + x * 0.02] as Vec;
  });
  return [cube, sphere, wave];
}

const SHAPES = buildShapes();
const COUNT = SHAPES[0].length;

export interface DotShapeHandle {
  /** 0 = shape, 1 = every point pulled to the centre */
  collapse: number;
}

/**
 * The welcome screen's animated "particle grid": a dot-matrix solid that slowly rotates and
 * morphs between a cube, a sphere and a wave. Canvas 2D, ~30 fps, paused when hidden; a single
 * still frame when the user prefers reduced motion.
 */
export function DotShape({
  className,
  size = 240,
  handle,
}: {
  className?: string;
  size?: number;
  handle?: React.RefObject<DotShapeHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // a little per-dot jitter so it reads as "hand-drawn dashes", like the reference
    const jitter = Array.from({ length: COUNT }, (_, index) => {
      const seed = Math.sin(index * 12.9898) * 43758.5453;
      return seed - Math.floor(seed);
    });

    let frame = 0;
    let last = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const cycle = 7; // seconds per shape
      const phase = (t / cycle) % SHAPES.length;
      const from = SHAPES[Math.floor(phase)];
      const to = SHAPES[(Math.floor(phase) + 1) % SHAPES.length];
      const raw = Math.min(1, Math.max(0, (phase % 1) * 1.6 - 0.6)); // hold, then morph
      const mix = raw * raw * (3 - 2 * raw);
      const rotY = t * 0.35;
      const rotX = -0.45 + Math.sin(t * 0.25) * 0.15;
      const cy = Math.cos(rotY);
      const sy = Math.sin(rotY);
      const cx = Math.cos(rotX);
      const sx = Math.sin(rotX);
      const collapse = handle?.current?.collapse ?? 0;
      const scale = size * 0.28 * (1 - collapse * 0.92);

      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = "round";
      for (let index = 0; index < COUNT; index += 1) {
        const a = from[index];
        const b = to[index];
        let x = a[0] + (b[0] - a[0]) * mix;
        let y = a[1] + (b[1] - a[1]) * mix;
        let z = a[2] + (b[2] - a[2]) * mix;
        // rotate around Y then X
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        x = x1;
        y = y1;
        z = z2;
        const depth = 1 / (2.8 - z * 0.6);
        const px = size / 2 + x * scale * depth * 2.2;
        const py = size / 2 + y * scale * depth * 2.2;
        const alpha = Math.max(0.15, Math.min(1, 0.35 + (z + 1.3) * 0.32)) * (1 - collapse * 0.4);
        const len = 1.2 + jitter[index] * 2.4 * (1 - collapse);
        const angle = jitter[index] * Math.PI + t * 0.4 * (jitter[index] - 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + depth * 0.6;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * len, py - Math.sin(angle) * len);
        ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
        ctx.stroke();
      }
    };

    if (reduce && !handle) {
      draw(start + 2000);
      return;
    }
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden || now - last < 32) return; // ~30 fps is plenty for a slow drift
      last = now;
      draw(reduce ? start + 2000 : now);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [size, handle]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ width: size, height: size }} />;
}
