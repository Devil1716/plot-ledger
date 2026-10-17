"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { IndianRupee } from "lucide-react";
import { haptic } from "@/lib/native";
import { lockAxis, PULL_THRESHOLD, rubberPull } from "@/lib/swipe";

/**
 * Pull the ledger down from the very top to open the pay flow. The content rubber-bands
 * (transform only) and a "Pull to pay" badge fills up; releasing past the threshold opens it.
 * Normal scrolling is untouched: it only engages at scrollY 0 on a clearly downward drag.
 */
export function PullToPay({
  enabled,
  onTrigger,
  children,
}: {
  enabled: boolean;
  onTrigger: () => void;
  children: React.ReactNode;
}) {
  const pull = useMotionValue(0);
  const progress = useTransform(pull, [0, PULL_THRESHOLD], [0, 1], { clamp: true });
  const hintOpacity = useTransform(pull, [6, 34], [0, 1]);
  const hintY = useTransform(pull, (value) => value * 0.45 - 30);
  const fillScale = progress;
  const ringScale = useTransform(pull, [PULL_THRESHOLD - 1, PULL_THRESHOLD, PULL_THRESHOLD + 30], [1, 1.12, 1.18]);
  const pullLabel = useTransform(progress, [0.9, 1], [1, 0]);
  const releaseLabel = useTransform(progress, [0.9, 1], [0, 1]);
  const triggerRef = useRef(onTrigger);
  useEffect(() => {
    triggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) return;
    let state: "idle" | "pending" | "pulling" | "ignored" = "idle";
    let startX = 0;
    let startY = 0;
    let armed = false;
    let settle: ReturnType<typeof animate> | null = null;

    const onStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        document.body.style.overflow === "hidden" ||
        target?.closest('[data-no-swipe], [role="dialog"], input, textarea, select, [role="slider"]')
      ) {
        state = "ignored";
        return;
      }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      armed = false;
      state = "pending";
    };
    const onMove = (event: TouchEvent) => {
      if (state === "idle" || state === "ignored") return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (state === "pending") {
        const axis = lockAxis(dx, dy);
        if (axis === null) return;
        if (axis !== "y" || dy <= 0 || window.scrollY > 0) {
          state = "ignored";
          return;
        }
        state = "pulling";
        settle?.stop();
      }
      if (event.cancelable) event.preventDefault();
      const value = rubberPull(dy - 10);
      pull.set(value);
      const nowArmed = value >= PULL_THRESHOLD;
      if (nowArmed !== armed) {
        armed = nowArmed;
        if (armed) haptic("tick");
      }
    };
    const onEnd = () => {
      if (state !== "pulling") {
        state = "idle";
        return;
      }
      state = "idle";
      if (armed) {
        haptic("confirm");
        triggerRef.current();
      }
      settle = animate(pull, 0, { type: "spring", stiffness: 380, damping: 34 });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      settle?.stop();
      pull.set(0);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, pull]);

  return (
    <div className="relative">
      {enabled ? (
        <motion.div
          aria-hidden
          data-testid="pull-to-pay-hint"
          className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1.5"
          style={{ opacity: hintOpacity, y: hintY }}
        >
          <motion.span
            className="relative grid size-10 place-items-center overflow-hidden rounded-full ring-2 ring-[var(--mint)]"
            style={{ scale: ringScale }}
          >
            <motion.span className="absolute inset-0 rounded-full bg-[var(--mint)]" style={{ scale: fillScale }} />
            <IndianRupee className="relative size-4 text-white mix-blend-difference" aria-hidden />
          </motion.span>
          <span className="relative h-4 text-xs font-medium text-white/80">
            <motion.span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ opacity: pullLabel }}>
              Pull to pay
            </motion.span>
            <motion.span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ opacity: releaseLabel }}>
              Release to pay
            </motion.span>
          </span>
        </motion.div>
      ) : null}
      <motion.div style={{ y: pull }}>{children}</motion.div>
    </div>
  );
}
