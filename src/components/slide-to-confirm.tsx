"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  AnimatePresence,
  animate,
  easeOut,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Check, ChevronsRight, Loader2 } from "lucide-react";
import { haptic } from "@/lib/native";

export type SlideStatus = "idle" | "saving" | "done";

const TRACK_H = 64;
const PAD = 6;
const THUMB = TRACK_H - PAD * 2;
const CONFIRM_AT = 0.9;
/** A quick flick past this point also confirms. */
const FLICK_AT = 0.6;
const FLICK_VELOCITY = 700; // px/s
const VELOCITY_WINDOW = 100; // ms of pointer history used for the release velocity

function releaseVelocity(samples: { t: number; x: number }[], now: number) {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
}

const SNAP_BACK = { type: "spring", stiffness: 210, damping: 19, mass: 1 } as const; // ζ≈0.66: soft, small overshoot
const SNAP_END = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const; // ζ≈0.8: settles with a hint of give
const ICON_SWAP = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * iOS-style "slide to confirm". Every visual (thumb, fill, label, aria value, parent progress) is derived from one
 * motion value, so dragging never re-renders React. Releasing past 90%, or flicking right past 60%, confirms;
 * anything less springs back. Keyboard: focus the thumb and press Enter, Space, → or End.
 */
export function SlideToConfirm({
  label,
  status,
  disabled = false,
  onConfirm,
  progress,
}: {
  label: string;
  status: SlideStatus;
  disabled?: boolean;
  onConfirm: () => void;
  /** Optional 0..1 motion value mirrored from the thumb position (drives the amount colour). */
  progress?: MotionValue<number>;
}) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const max = useMotionValue(260);
  const drag = useRef<{ id: number; offset: number } | null>(null);
  const crossed = useRef(false);
  const locked = status !== "idle" || disabled;

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => max.set(Math.max(1, el.clientWidth - THUMB - PAD * 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [max]);

  // single source of truth: p = x / max
  const p = useTransform([x, max], ([value, width]: number[]) => Math.min(1, Math.max(0, value / width)));
  const labelOpacity = useTransform(p, [0, 0.55], [1, 0], { ease: easeOut });
  const labelX = useTransform(p, [0, 1], [0, 28]);
  // mint pill whose rounded right edge rides just behind the thumb centre
  const fillX = useTransform([x, max], ([value, width]: number[]) => value - width - THUMB / 2 - PAD);
  const fillOpacity = useTransform(x, [0, 14], [0, 1]);
  const thumbShadow = useTransform(p, [0, 1], ["0 4px 14px rgb(0 0 0 / 0.35)", "0 6px 18px rgb(4 120 87 / 0.45)"]);

  // mirror to the parent and to aria without React state
  useMotionValueEvent(p, "change", (value) => {
    progress?.set(value);
    const node = thumbRef.current;
    if (node && status === "idle") {
      const pct = Math.round(value * 100);
      node.setAttribute("aria-valuenow", String(pct));
      node.setAttribute("aria-valuetext", `${pct}%, press Enter to confirm`);
    }
  });

  const springBack = useCallback(
    (velocity = 0) => {
      animate(x, 0, reduce ? { duration: 0 } : { ...SNAP_BACK, velocity });
    },
    [reduce, x],
  );

  const complete = useCallback(
    (velocity = 0) => {
      animate(x, max.get(), reduce ? { duration: 0 } : { ...SNAP_END, velocity: Math.max(0, velocity) });
      haptic("confirm");
      onConfirm();
    },
    [max, onConfirm, reduce, x],
  );

  // when a save fails the parent drops back to idle: return the thumb home
  useEffect(() => {
    if (status === "idle" && x.get() > 0 && !drag.current) springBack();
  }, [status, springBack, x]);

  // release velocity from recent pointer samples (px/s); robust even when the last move landed a few frames before pointerup
  const samples = useRef<{ t: number; x: number }[]>([]);
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (locked) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // synthetic pointers (some automation / assistive tech) have no capturable pointer
    }
    x.stop();
    drag.current = { id: event.pointerId, offset: event.clientX - x.get() };
    samples.current = [{ t: event.timeStamp, x: x.get() }];
    crossed.current = false;
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const width = max.get();
    const next = Math.min(width, Math.max(0, event.clientX - drag.current.offset));
    x.set(next);
    samples.current = [...samples.current, { t: event.timeStamp, x: next }].filter((s) => event.timeStamp - s.t <= VELOCITY_WINDOW);
    const past = next >= width * CONFIRM_AT;
    if (past && !crossed.current) haptic("tick");
    crossed.current = past;
  }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    const width = max.get();
    const position = x.get();
    const velocity = releaseVelocity(samples.current, event.timeStamp);
    samples.current = [];
    if (position >= width * CONFIRM_AT || (position >= width * FLICK_AT && velocity > FLICK_VELOCITY)) complete(velocity);
    else springBack(velocity);
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (locked) return;
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      complete(900);
    }
  }

  return (
    <div
      ref={trackRef}
      data-testid="slide-to-confirm"
      className="relative w-full overflow-hidden rounded-full bg-[#1a1a1a] shadow-[inset_0_2px_6px_rgb(0_0_0/0.5)] ring-1 ring-white/10 select-none"
      style={{ height: TRACK_H, touchAction: "none", contain: "layout paint", transform: "translateZ(0)" }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0 w-full rounded-full bg-[#3a3a3a]"
        style={{ x: fillX, opacity: fillOpacity, willChange: "transform, opacity" }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-[15px] font-semibold tracking-wide"
        style={{ opacity: labelOpacity, x: labelX, willChange: "transform, opacity" }}
      >
        <span className="slide-glint">{label}</span>
      </motion.span>
      <motion.div
        ref={thumbRef}
        role="slider"
        tabIndex={locked ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status === "idle" ? 0 : 100}
        aria-valuetext={status === "saving" ? "Saving" : status === "done" ? "Saved" : "0%, press Enter to confirm"}
        aria-disabled={locked}
        data-testid="slide-thumb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="absolute cursor-grab rounded-full bg-white text-black outline-none focus-visible:ring-4 focus-visible:ring-white/50 active:cursor-grabbing"
        style={{ x, top: PAD, left: PAD, width: THUMB, height: THUMB, boxShadow: thumbShadow, willChange: "transform" }}
        whileTap={locked ? undefined : { scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <AnimatePresence initial={false}>
          <motion.span
            key={status}
            className={`absolute inset-0 grid place-items-center ${status === "done" ? "text-black" : ""}`}
            initial={{ opacity: 0, scale: 0.55, rotate: status === "done" ? -45 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.55 }}
            transition={reduce ? { duration: 0 } : ICON_SWAP}
            style={{ willChange: "transform, opacity" }}
          >
            {status === "saving" ? (
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : status === "done" ? (
              <Check className="size-7" strokeWidth={3} aria-hidden />
            ) : (
              <ChevronsRight className="size-6" aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

