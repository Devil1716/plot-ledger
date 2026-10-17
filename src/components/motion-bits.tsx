"use client";

import { animate, motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Animates an integer from its previous value to `value`, rendering via `format`. */
export function CountUp({
  value,
  format,
  duration = 0.9,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => setAnimated(Math.round(latest)),
      onComplete: () => setAnimated(value),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  const shown = reduce ? value : animated;
  return <>{format(shown)}</>;
}

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 52, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 20 } },
};

/** Rows that sweep in from the side (history, people). */
export const sideItemVariants: Variants = {
  hidden: { opacity: 0, x: -56, scale: 0.94 },
  show: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 22 } },
};

export const popVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 420, damping: 14 } },
};

export const tap = {
  whileTap: { scale: 0.92 },
  whileHover: { y: -3 },
  transition: { type: "spring", stiffness: 520, damping: 18 },
} as const;

/** Deterministic pseudo-random in [0,1) so particle layouts stay pure across renders. */
export function seeded(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export { motion };
