import { describe, expect, it } from "vitest";
import { edgeResist, lockAxis, normalizePath, PULL_MAX, PULL_THRESHOLD, rubberPull, settleTab, tabIndexOf } from "@/lib/swipe";

describe("tab paths", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizePath("/history/")).toBe("/history");
    expect(normalizePath("/")).toBe("/");
    expect(tabIndexOf("/people/")).toBe(2);
    expect(tabIndexOf("/")).toBe(1);
    expect(tabIndexOf("/login")).toBe(-1);
  });
});

describe("lockAxis", () => {
  it("waits for 10px, then prefers vertical unless clearly horizontal", () => {
    expect(lockAxis(5, 4)).toBeNull();
    expect(lockAxis(20, 4)).toBe("x");
    expect(lockAxis(12, 11)).toBe("y");
    expect(lockAxis(2, -30)).toBe("y");
  });
});

describe("settleTab", () => {
  const W = 400;
  it("needs distance or a flick", () => {
    expect(settleTab(1, 3, -50, -0.1, W)).toBe(1);
    expect(settleTab(1, 3, -130, -0.1, W)).toBe(2);
    expect(settleTab(1, 3, 60, 0.8, W)).toBe(0);
    expect(settleTab(1, 3, 60, -0.8, W)).toBe(1);
  });
  it("never leaves the tab range", () => {
    expect(settleTab(0, 3, 300, 1, W)).toBe(0);
    expect(settleTab(2, 3, -300, -1, W)).toBe(2);
  });
  it("resists at the edges", () => {
    expect(edgeResist(100, 0, 3)).toBe(25);
    expect(edgeResist(-100, 0, 3)).toBe(-100);
  });
});

describe("rubberPull", () => {
  it("is monotonic, capped and reaches the threshold", () => {
    expect(rubberPull(-10)).toBe(0);
    expect(rubberPull(100)).toBeLessThan(100);
    expect(rubberPull(1000)).toBeLessThan(PULL_MAX);
    expect(rubberPull(200)).toBeGreaterThan(PULL_THRESHOLD);
    expect(rubberPull(100)).toBeLessThan(PULL_THRESHOLD);
  });
});
