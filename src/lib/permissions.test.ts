import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { canDeletePayment, canEditPayment, editTimeLeft, EDIT_WINDOW_MS } from "@/lib/permissions";

const now = Date.UTC(2026, 9, 17, 12);
const at = (msAgo: number) => Timestamp.fromMillis(now - msAgo);

describe("canEditPayment", () => {
  const own = { createdBy: "me", personId: "rohan", createdAt: at(60_000) };
  it("allows the creator for their own person inside 24h", () => {
    expect(canEditPayment(own, "me", "rohan", now)).toBe(true);
    expect(editTimeLeft(own, now)).toBe(EDIT_WINDOW_MS - 60_000);
  });
  it("locks after 24h", () => {
    expect(canEditPayment({ ...own, createdAt: at(EDIT_WINDOW_MS) }, "me", "rohan", now)).toBe(false);
  });
  it("denies other people's payments and unlinked accounts", () => {
    expect(canEditPayment(own, "someone-else", "rohan", now)).toBe(false);
    expect(canEditPayment(own, "me", "kavita", now)).toBe(false);
    expect(canEditPayment(own, "me", null, now)).toBe(false);
    expect(canEditPayment(own, null, "rohan", now)).toBe(false);
  });
});

describe("canDeletePayment", () => {
  it("lets the creator remove their own entry at any age, and nobody else", () => {
    const own = { createdBy: "me", personId: "rohan", createdAt: at(30 * EDIT_WINDOW_MS) };
    expect(canDeletePayment(own, "me", "rohan")).toBe(true);
    expect(canDeletePayment(own, "admin", "ananya")).toBe(false);
    expect(canDeletePayment(own, "me", "kavita")).toBe(false);
    expect(canDeletePayment(own, null, "rohan")).toBe(false);
  });
});

describe("payments an admin added for a member", () => {
  const behalf = { createdBy: "admin", personId: "rohan", createdAt: at(60_000) };
  it("belong to the admin who added them, not to the member", () => {
    expect(canEditPayment(behalf, "admin", "ananya", now, true)).toBe(true);
    expect(canDeletePayment(behalf, "admin", "ananya", true)).toBe(true);
    expect(canEditPayment(behalf, "rohan-uid", "rohan", now, false)).toBe(false);
    expect(canDeletePayment(behalf, "rohan-uid", "rohan", false)).toBe(false);
    // once no longer an admin, they can't touch it
    expect(canDeletePayment(behalf, "admin", "ananya", false)).toBe(false);
  });
  it("never let an admin touch an entry a member added", () => {
    const own = { createdBy: "rohan-uid", personId: "rohan", createdAt: at(60_000) };
    expect(canDeletePayment(own, "admin", "ananya", true)).toBe(false);
    expect(canEditPayment(own, "admin", "ananya", now, true)).toBe(false);
  });
});
