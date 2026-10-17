/** Pure helpers for the tab swipe + pull-to-pay gestures (unit tested). */

export const TAB_PATHS = ["/history", "/", "/people"] as const;

/** "/history/" (static export, trailingSlash) → "/history". */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

export function tabIndexOf(pathname: string): number {
  return (TAB_PATHS as readonly string[]).indexOf(normalizePath(pathname));
}

export const LOCK_DISTANCE = 10;

/** Decide the gesture axis once the finger has moved far enough; null = keep waiting. */
export function lockAxis(dx: number, dy: number): "x" | "y" | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < LOCK_DISTANCE && ay < LOCK_DISTANCE) return null;
  if (ax > ay * 1.2) return "x";
  return "y";
}

/**
 * Where a released horizontal drag should settle. `drag` > 0 means the finger moved right
 * (towards the previous tab). Returns the target tab index.
 */
export function settleTab(active: number, count: number, drag: number, velocity: number, width: number): number {
  const direction = drag > 0 ? -1 : drag < 0 ? 1 : 0;
  if (direction === 0) return active;
  const target = active + direction;
  if (target < 0 || target >= count) return active;
  const far = Math.abs(drag) > width * 0.25;
  const flick = Math.abs(velocity) > 0.4 && Math.sign(velocity) === Math.sign(drag) && Math.abs(drag) > 24;
  return far || flick ? target : active;
}

/** Rubber band past the first/last tab. */
export function edgeResist(drag: number, active: number, count: number): number {
  if ((drag > 0 && active === 0) || (drag < 0 && active === count - 1)) return drag * 0.25;
  return drag;
}

export const PULL_MAX = 150;
export const PULL_RANGE = 240;
export const PULL_THRESHOLD = 76;

/** Finger distance → visual pull distance with an exponential rubber band. */
export function rubberPull(raw: number): number {
  if (raw <= 0) return 0;
  return PULL_MAX * (1 - Math.exp(-raw / PULL_RANGE));
}

/** True when the element (or an ancestor up to `stop`) should keep horizontal gestures to itself. */
export function blocksHorizontalSwipe(target: EventTarget | null, stop: Element | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== stop) {
    if (node.matches('[data-no-swipe], input, textarea, select, [role="slider"], [contenteditable="true"]')) return true;
    if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}
