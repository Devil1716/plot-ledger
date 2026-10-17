"use client";

import { useEffect, useRef } from "react";

type Vec = [number, number, number];

const COUNT = 520;

/** Sample points evenly from a bold "₹" drawn on an offscreen canvas (two thin layers for depth). */
function sampleRupee(): Vec[] {
  const S = 160;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${S * 0.92}px system-ui, "Noto Sans", sans-serif`;
  ctx.fillText("₹", S / 2, S / 2 + S * 0.04);
  const data = ctx.getImageData(0, 0, S, S).data;
  const inside: Array<[number, number]> = [];
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      if (data[(y * S + x) * 4 + 3] > 128) inside.push([x, y]);
    }
  }
  if (inside.length === 0) return [];
  const points: Vec[] = [];
  for (let index = 0; index < COUNT; index += 1) {
    const [x, y] = inside[Math.floor((index / COUNT) * inside.length)];
    const layer = index % 2 === 0 ? 0.12 : -0.12;
    points.push([(x / S) * 2 - 1, (y / S) * 2 - 1, layer]);
  }
  return points;
}

/** Cheap smooth pseudo-noise from a few sines: enough for a calm, organic wobble. */
function wobble(x: number, y: number, z: number, t: number): number {
  return (
    0.16 * Math.sin(x * 2.1 + t * 0.9) * Math.cos(y * 1.7 - t * 0.6) +
    0.12 * Math.sin(y * 2.9 + z * 1.3 + t * 0.7) +
    0.08 * Math.cos(z * 3.3 - x * 1.1 + t * 1.1)
  );
}

const smooth = (v: number) => v * v * (3 - 2 * v);

/**
 * Welcome-screen particle animation: dots form a "₹", flow into an irregular organic blob,
 * and flow back, looping calmly. Canvas 2D at display refresh, paused when hidden; a single
 * still "₹" frame with reduced motion. `handle.collapse` pulls everything to the centre
 * (used by the post-sign-in entry animation).
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rupee = sampleRupee();
    if (rupee.length === 0) return;
    // each glyph dot gets a home direction on the blob, so neighbours stay neighbours while flowing
    const dirs = rupee.map(([x, y, z], index) => {
      const jitterZ = Math.sin(index * 7.13) * 0.9;
      const len = Math.hypot(x, y, z + jitterZ) || 1;
      return [x / len, y / len, (z + jitterZ) / len] as Vec;
    });
    const jitter = rupee.map((_, index) => {
      const seed = Math.sin(index * 12.9898) * 43758.5453;
      return seed - Math.floor(seed);
    });

    // loop: hold ₹ → flow to blob → hold blob → flow back
    const HOLD_R = 2.6;
    const FLOW = 2.2;
    const HOLD_B = 2.6;
    const LOOP = HOLD_R + FLOW + HOLD_B + FLOW;
    const blobMix = (t: number) => {
      const p = t % LOOP;
      if (p < HOLD_R) return 0;
      if (p < HOLD_R + FLOW) return smooth((p - HOLD_R) / FLOW);
      if (p < HOLD_R + FLOW + HOLD_B) return 1;
      return 1 - smooth((p - HOLD_R - FLOW - HOLD_B) / FLOW);
    };

    const draw = (t: number) => {
      const mix = blobMix(t);
      // a gentle sway (never so far that the ₹ stops reading), a bit more as a blob
      const rotY = Math.sin(t * 0.45) * (0.35 + mix * 0.5);
      const rotX = Math.sin(t * 0.3) * 0.12 - mix * 0.2;
      const cy = Math.cos(rotY);
      const sy = Math.sin(rotY);
      const cx = Math.cos(rotX);
      const sx = Math.sin(rotX);
      const collapse = handle?.current?.collapse ?? 0;
      const scale = size * 0.4 * (1 - collapse * 0.94);

      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = "round";
      for (let index = 0; index < rupee.length; index += 1) {
        const r = rupee[index];
        const d = dirs[index];
        const radius = 0.78 + wobble(d[0], d[1], d[2], t);
        // glyph dots breathe very slightly so the ₹ never looks frozen
        const breathe = 1 + Math.sin(t * 1.3 + jitter[index] * 6.28) * 0.012;
        let x = r[0] * breathe * (1 - mix) + d[0] * radius * mix;
        let y = r[1] * breathe * (1 - mix) + d[1] * radius * mix;
        let z = r[2] * (1 - mix) + d[2] * radius * mix;
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        x = x1;
        y = y1;
        z = z2;
        const depth = 1 / (2.4 - z * 0.5);
        const px = size / 2 + x * scale * depth * 2.4;
        const py = size / 2 + y * scale * depth * 2.4;
        const alpha = Math.max(0.2, Math.min(1, 0.55 + z * 0.45)) * (1 - collapse * 0.4);
        const len = 1 + jitter[index] * 2.2 * (1 - collapse);
        const angle = jitter[index] * Math.PI + t * 0.35 * (jitter[index] - 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.9 + depth * 0.7;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * len, py - Math.sin(angle) * len);
        ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
        ctx.stroke();
      }
    };

    if (reduce && !handle) {
      draw(0.5);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden) return;
      draw(reduce ? 0.5 : (now - start) / 1000);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [size, handle]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ width: size, height: size }} />;
}

export interface DotShapeHandle {
  /** 0 = shape, 1 = every point pulled to the centre */
  collapse: number;
}
