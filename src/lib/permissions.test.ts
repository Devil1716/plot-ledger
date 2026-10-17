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
