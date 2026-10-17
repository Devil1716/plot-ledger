import type { PaymentRecord } from "@/lib/records";

/** Mirrors firestore.rules: creators can edit their own entry for 24 hours. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canEditPayment(
  payment: Pick<PaymentRecord, "createdBy" | "personId" | "createdAt">,
  uid: string | null | undefined,
  myPersonId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!uid || !myPersonId) return false;
  if (payment.createdBy !== uid || payment.personId !== myPersonId) return false;
  const created = payment.createdAt?.toMillis?.();
  if (typeof created !== "number") return false;
  return now - created < EDIT_WINDOW_MS;
}

/** Your own entries can be removed at any time (mirrors the delete rule); nobody removes others'. */
export function canDeletePayment(
  payment: Pick<PaymentRecord, "createdBy" | "personId">,
  uid: string | null | undefined,
  myPersonId: string | null | undefined,
): boolean {
  return Boolean(uid && myPersonId && payment.createdBy === uid && payment.personId === myPersonId);
}

/** Milliseconds left in the edit window (0 when locked). */
export function editTimeLeft(payment: Pick<PaymentRecord, "createdAt">, now: number = Date.now()): number {
  const created = payment.createdAt?.toMillis?.();
  if (typeof created !== "number") return 0;
  return Math.max(0, created + EDIT_WINDOW_MS - now);
}
