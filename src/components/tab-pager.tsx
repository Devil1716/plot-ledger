"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, type MotionValue } from "motion/react";
import { Dashboard } from "@/components/dashboard";
import { HistoryView } from "@/components/history-view";
import { PeopleView } from "@/components/people-view";
import { TabActiveContext } from "@/components/tab-active";
import { haptic } from "@/lib/native";
import { blocksHorizontalSwipe, edgeResist, lockAxis, settleTab, TAB_PATHS } from "@/lib/swipe";


const HistoryTab = memo(function HistoryTab() {
  return (
    <div className="sheet min-h-[70vh] rounded-t-[2rem] px-4 pt-6 pb-[calc(8rem+var(--safe-bottom))] sm:rounded-[2rem] sm:px-8 sm:pb-8">
      <HistoryView />
    </div>
  );
});
const LedgerTab = memo(function LedgerTab() {
  return <Dashboard />;
});
const PeopleTab = memo(function PeopleTab() {
  return (
    <div className="sheet min-h-[70vh] rounded-t-[2rem] px-4 pt-6 pb-[calc(8rem+var(--safe-bottom))] sm:rounded-[2rem] sm:px-8 sm:pb-8">
      <PeopleView />
    </div>
  );
});
const TAB_VIEWS = [HistoryTab, LedgerTab, PeopleTab];
const COUNT = TAB_PATHS.length;
const SPRING = { type: "spring", stiffness: 420, damping: 42, mass: 0.9 } as const;

/**
 * Instagram-style pager: the three tabs sit side by side; the page follows a horizontal
 * finger 1:1 and snaps to the nearest tab. Only transforms change during a gesture.
 * `drag` (px, + = finger moved right) is shared with the bottom bar so its pill tracks along.
 */
export function TabPager({
  active,
  drag,
  width,
  onNavigate,
}: {
  active: number;
  drag: MotionValue<number>;
  width: MotionValue<number>;
  onNavigate: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const prevActive = useRef(active);
  const swipedTo = useRef<number | null>(null);
  const scrolls = useRef<number[]>(TAB_PATHS.map(() => 0));
  const settling = useRef<ReturnType<typeof animate> | null>(null);
  const x0 = useMotionValue(0);
  const x1 = useMotionValue(0);
  const x2 = useMotionValue(0);
  const y0 = useMotionValue(0);
  const y1 = useMotionValue(0);
  const y2 = useMotionValue(0);
  const xs = [x0, x1, x2];
  const ys = [y0, y1, y2];
  const xsRef = useRef(xs);
  const ysRef = useRef(ys);
  // neighbours mount shortly after the first paint so the first swipe has real content
  const [mounted, setMounted] = useState<boolean[]>(() => TAB_PATHS.map((_, index) => index === active));
  const [visible, setVisible] = useState<boolean[]>(() => TAB_PATHS.map((_, index) => index === active));

  // place every panel from the shared drag value (no React render per frame)
  useEffect(() => {
    const layout = () => {
      const w = width.get();
      const d = drag.get();
      xsRef.current.forEach((x, index) => x.set((index - activeRef.current) * w + d));
    };
    layout();
    const offDrag = drag.on("change", layout);
    const offWidth = width.on("change", layout);
    return () => {
      offDrag();
      offWidth();
    };
  }, [drag, width]);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const measure = () => width.set(containerRef.current?.clientWidth || window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    const onScroll = () => {
      scrolls.current[activeRef.current] = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
    };
  }, [width]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted((current) =>
        current.some((value, index) => !value && Math.abs(index - active) === 1)
          ? current.map((value, index) => value || Math.abs(index - active) <= 1)
          : current,
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [active]);

  const showOnly = (indexes: number[]) => {
    setVisible(TAB_PATHS.map((_, index) => indexes.includes(index)));
  };

  // the route changed (swipe commit, bottom-bar tap or Android back)
  useLayoutEffect(() => {
    const from = prevActive.current;
    if (from === active) return;
    prevActive.current = active;
    activeRef.current = active;
    setMounted((current) => (current[active] ? current : current.map((value, index) => value || index === active)));
    settling.current?.stop();
    const w = width.get();
    const target = scrolls.current[active] ?? 0;
    const fromScroll = scrolls.current[from] ?? 0;
    if (swipedTo.current === active) {
      // the new tab is already on screen: just hand it the normal document flow
      swipedTo.current = null;
      window.scrollTo(0, target);
      ysRef.current.forEach((y) => y.set(0));
      drag.set(0);
      showOnly([active]);
      return;
    }
    swipedTo.current = null;
    window.scrollTo(0, target);
    ysRef.current.forEach((y, index) => y.set(index === from ? target - fromScroll : 0));
    showOnly([from, active]);
    drag.set((active - from) * w);
    settling.current = animate(drag, 0, {
      ...SPRING,
      onComplete: () => {
        ysRef.current.forEach((y) => y.set(0));
        showOnly([activeRef.current]);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // horizontal swipe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let state: "idle" | "pending" | "dragging" | "ignored" = "idle";
    let startX = 0;
    let startY = 0;
    let samples: Array<{ x: number; t: number }> = [];
    let suppressClick = false;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || swipedTo.current !== null || document.body.style.overflow === "hidden") {
        state = "ignored";
        return;
      }
      if (blocksHorizontalSwipe(event.target, el)) {
        state = "ignored";
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      state = "pending";
    };

    const onMove = (event: TouchEvent) => {
      if (state === "idle" || state === "ignored") return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (state === "pending") {
        const axis = lockAxis(dx, dy);
        if (axis === null) return;
        if (axis === "y") {
          state = "ignored";
          return;
        }
        state = "dragging";
        samples = [];
        settling.current?.stop();
        const current = activeRef.current;
        const scrollY = window.scrollY;
        scrolls.current[current] = scrollY;
        ysRef.current.forEach((y, index) => y.set(index === current ? 0 : scrollY - (scrolls.current[index] ?? 0)));
        showOnly([current - 1, current, current + 1]);
      }
      if (event.cancelable) event.preventDefault();
      // 1:1 with the finger from where it first touched
      const raw = dx;
      drag.set(edgeResist(raw, activeRef.current, COUNT));
      const now = performance.now();
      samples.push({ x: touch.clientX, t: now });
      while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    };

    const finish = (cancelled: boolean) => {
      if (state !== "dragging") {
        state = "idle";
        return;
      }
      state = "idle";
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 350);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocity = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const current = activeRef.current;
      const w = width.get();
      const target = cancelled ? current : settleTab(current, COUNT, drag.get(), velocity, w);
      settling.current = animate(drag, (current - target) * w, {
        ...SPRING,
        velocity: velocity * 1000,
        onComplete: () => {
          if (target === current) {
            ysRef.current.forEach((y) => y.set(0));
            showOnly([current]);
            return;
          }
          swipedTo.current = target;
          haptic("tick");
          onNavigate(target);
        },
      });
    };
    const onEnd = () => finish(false);
    const onCancel = () => finish(true);
    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      el.removeEventListener("click", onClick, true);
    };
  }, [drag, width, onNavigate]);

  return (
    <div ref={containerRef} className="relative touch-pan-y" data-testid="tab-pager">
      {TAB_VIEWS.map((View, index) => {
        if (!mounted[index] && index !== active) return null;
        const isActive = index === active;
        return (
          <motion.section
            key={TAB_PATHS[index]}
            aria-hidden={isActive ? undefined : true}
            inert={!isActive}
            data-tab={TAB_PATHS[index]}
            className={isActive ? "relative w-full" : "absolute inset-x-0 top-0 w-full"}
            style={{
              x: xs[index],
              y: ys[index],
              visibility: isActive || visible[index] ? "visible" : "hidden",
              pointerEvents: isActive ? undefined : "none",
            }}
          >
            <TabActiveContext.Provider value={isActive}>
              <View />
            </TabActiveContext.Provider>
          </motion.section>
        );
      })}
    </div>
  );
}
