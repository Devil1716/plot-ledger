"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { DotShape, type DotShapeHandle } from "@/components/brand/dot-shape";

const PENDING_KEY = "plotledger:entry-pending";
const SEEN_KEY = "plotledger:entry-seen";

/** Called when a sign-in starts, so the ledger plays the entry animation once it opens. */
export function markEntryPending() {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // storage unavailable: just skip the animation
  }
}

function takePending(): { play: boolean; repeat: boolean } {
  try {
    const play = sessionStorage.getItem(PENDING_KEY) === "1";
    sessionStorage.removeItem(PENDING_KEY);
    const repeat = localStorage.getItem(SEEN_KEY) === "1";
    if (play) localStorage.setItem(SEEN_KEY, "1");
    return { play, repeat };
  } catch {
    return { play: false, repeat: true };
  }
}

/**
 * After sign-in: the welcome screen's dot grid pulls into the wallet logo, which then opens
 * onto the ledger. ~1.5 s the first time, ~0.8 s after that, tap to skip, a plain fade with
 * reduced motion. Normal launches (already signed in) don't play it at all.
 */
export function EntryTransition() {
  const [state, setState] = useState<{ play: boolean; repeat: boolean } | null>(null);
  const reduce = useReducedMotion();
  const dots = useRef<DotShapeHandle>({ collapse: 0 });
  const [logo, setLogo] = useState(false);

  useEffect(() => {
    const pending = takePending();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads session storage once after mount
    if (pending.play) setState(pending);
  }, []);

  useEffect(() => {
    if (!state?.play) return;
    if (reduce) {
      const timer = setTimeout(() => setState(null), 250);
      return () => clearTimeout(timer);
    }
    const pull = state.repeat ? 0.45 : 0.8;
    const hold = state.repeat ? 0.2 : 0.45;
    const control = animate(0, 1, {
      duration: pull,
      ease: [0.6, 0, 0.8, 0.4],
      onUpdate: (value) => {
        dots.current.collapse = value;
      },
    });
    const showLogo = setTimeout(() => setLogo(true), pull * 800);
    const done = setTimeout(() => setState(null), (pull + hold) * 1000);
    return () => {
      control.stop();
      clearTimeout(showLogo);
      clearTimeout(done);
    };
  }, [state, reduce]);

  return (
    <AnimatePresence>
      {state?.play ? (
        <motion.div
          key="entry"
          data-testid="entry-transition"
          className="fixed inset-0 z-[100] grid place-items-center bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 1.06 }}
          transition={{ duration: reduce ? 0.2 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setState(null)}
          role="presentation"
        >
          {reduce ? null : <DotShape size={260} handle={dots} className="absolute" />}
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={logo || reduce ? { scale: 1, opacity: 1 } : { scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
          >
            <Image src="/logo-mark.png" alt="" width={72} height={72} unoptimized priority className="size-[72px]" />
          </motion.div>
          <button
            type="button"
            className="absolute right-4 bottom-[calc(1.5rem+var(--safe-bottom))] h-12 min-w-12 rounded-full px-4 text-sm text-[#9a9a9a] focus-visible:outline-2 focus-visible:outline-white"
            onClick={() => setState(null)}
          >
            Skip
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
