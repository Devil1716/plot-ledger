"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ChevronDown, IndianRupee } from "lucide-react";
import { haptic } from "@/lib/native";
import { lockAxis, PULL_THRESHOLD, rubberPull } from "@/lib/swipe";

/**
 * Pull the ledger down from the very top to open the pay flow. The content rubber-bands
 * (transform only) and a "Pull to pay" badge fills up; releasing past the threshold opens it.
 * Normal scrolling is untouched: it only engages at scrollY 0 on a clearly downward drag.
 */
const HINT_KEY = "plotledger:pull-hint-seen";
const PREVIEW_H = 168;

/**
 * The "Pull down to pay" hint is shown once per user on this device: after it has played
 * (or after the first successful pull) it never comes back.
 */
function useHintOnce(uid: string | undefined) {
  const [show, setShow] = useState(false);
  const key = uid ? `${HINT_KEY}:${uid}` : null;
  useEffect(() => {
    if (!key) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads storage once after mount
      setShow(localStorage.getItem(key) !== "1");
    } catch {
      setShow(false);
    }
  }, [key]);
  const markSeen = useCallback(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      // storage unavailable
    }
  }, [key]);
  const hide = useCallback(() => setShow(false), []);
  return { show, markSeen, hide };
}

export function PullToPay({
  enabled,
  onTrigger,
  payerName,
  hintUid,
  children,
}: {
  enabled: boolean;
  onTrigger: () => void;
  /** First name shown in the pay-page preview revealed while pulling. */
  payerName?: string;
  /** Signed-in uid: the one-time hint is remembered per user. */
  hintUid?: string;
  children: React.ReactNode;
}) {
  const pull = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const hint = useHintOnce(hintUid);
  const firstLaunches = hint.show;
  const chevronY = useMotionValue(0);
  // preview of the pay page: slides down from behind the top edge as you pull
  const previewY = useTransform(pull, (value) => value - PREVIEW_H);
  const previewOpacity = useTransform(pull, [8, 60], [0, 1]);
  const previewScale = useTransform(pull, [0, PULL_THRESHOLD, PULL_THRESHOLD + 40], [0.94, 1, 1.02]);
  const handleOpacity = useTransform(pull, [0, 40], [1, 0]);
  const progress = useTransform(pull, [0, PULL_THRESHOLD], [0, 1], { clamp: true });
  const fillScale = progress;
  const pullLabel = useTransform(progress, [0.9, 1], [1, 0]);
  const releaseLabel = useTransform(progress, [0.9, 1], [0, 1]);
  const triggerRef = useRef(onTrigger);
  const hintDoneRef = useRef(() => {});
  const { markSeen, hide } = hint;
  useEffect(() => {
    hintDoneRef.current = () => {
      markSeen();
      hide();
    };
  }, [markSeen, hide]);
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
        hintDoneRef.current();
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

  // seen once = seen: remember it as soon as the hint is on screen
  useEffect(() => {
    if (enabled && firstLaunches) markSeen();
  }, [enabled, firstLaunches, markSeen]);

  // the one time it shows: a few gentle "tugs" of the content plus a bouncing chevron
  useEffect(() => {
    if (!enabled || !firstLaunches || reduceMotion) return;
    let stopped = false;
    const running: Array<ReturnType<typeof animate>> = [];
    const stop = () => {
      stopped = true;
      running.forEach((animation) => animation.stop());
      if (pull.get() > 0 && pull.get() < 40) animate(pull, 0, { type: "spring", stiffness: 380, damping: 34 });
      chevronY.set(0);
    };
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    void (async () => {
      await wait(900);
      for (let round = 0; round < 3 && !stopped; round += 1) {
        const tug = animate(pull, [0, 30, 0, 12, 0], { duration: 1.1, ease: "easeInOut", times: [0, 0.3, 0.6, 0.8, 1] });
        const chev = animate(chevronY, [0, 5, 0, 5, 0], { duration: 1.1, ease: "easeInOut" });
        running.push(tug, chev);
        await Promise.all([tug, chev]);
        if (!stopped) await wait(2200);
      }
    })();
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    return () => {
      window.removeEventListener("touchstart", stop);
      stop();
    };
  }, [enabled, firstLaunches, reduceMotion, pull, chevronY]);

  return (
    <div className="relative">
      {enabled ? (
        <motion.div
          aria-hidden
          data-testid="pull-preview"
          className="pointer-events-none absolute inset-x-4 top-0 z-0 overflow-hidden rounded-3xl bg-white p-4 text-[#0f1524] shadow-[0_10px_30px_rgb(0_0_0/0.35)]"
          style={{ y: previewY, opacity: previewOpacity, scale: previewScale, height: PREVIEW_H - 16 }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-[#5a6478] uppercase">Record a payment</p>
            <span className="relative grid size-7 place-items-center overflow-hidden rounded-full ring-2 ring-[#10b981]" data-testid="pull-to-pay-hint">
              <motion.span className="absolute inset-0 rounded-full bg-[#10b981]" style={{ scale: fillScale }} />
              <IndianRupee className="relative size-3.5 text-white mix-blend-difference" aria-hidden />
            </span>
          </div>
          <p className="mt-0.5 text-sm font-semibold">You{payerName ? ` (${payerName})` : ""}</p>
          <p className="mt-2 font-heading text-3xl tabular-nums text-[#0f1524]/35">₹0</p>
          <div className="relative mt-2 h-4 text-xs font-medium text-[#5a6478]">
            <motion.span className="absolute left-0" style={{ opacity: pullLabel }}>
              Keep pulling…
            </motion.span>
            <motion.span className="absolute left-0 text-[#047857]" style={{ opacity: releaseLabel }}>
              Release to pay
            </motion.span>
          </div>
        </motion.div>
      ) : null}
      <motion.div className="relative z-[1]" style={{ y: pull }}>
        {enabled && firstLaunches ? (
          // visual hint only (keyboard / screen readers use the "Record a payment" button)
          <motion.div
            aria-hidden
            className="pointer-events-none -mt-1 mb-1 flex justify-center"
            style={{ opacity: handleOpacity }}
            data-testid="pull-handle"
          >
            <span className="flex items-center gap-1.5 rounded-b-2xl rounded-t-md bg-white/10 px-3.5 pt-1 pb-1.5 text-xs font-medium text-white/85 ring-1 ring-white/10 backdrop-blur-sm">
              <IndianRupee className="size-3.5 text-[var(--mint)]" aria-hidden />
              <span>Pull down to pay</span>
              <motion.span style={{ y: chevronY }} className="grid">
                <ChevronDown className="size-3.5" aria-hidden />
              </motion.span>
            </span>
          </motion.div>
        ) : null}
        {children}
      </motion.div>
    </div>
  );
}
