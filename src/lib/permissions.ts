import type { PaymentRecord } from "@/lib/records";

/** Mirrors firestore.rules: whoever added an entry can edit it for 24 hours. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Mirrors the rules' addedByMe(): you created it, and it's yours (members) or you're an admin
 * (the entries admins add for members). Nobody touches an entry someone else added.
 */
export function addedByMe(
  payment: Pick<PaymentRecord, "createdBy" | "personId">,
  uid: string | null | undefined,
  myPersonId: string | null | undefined,
  isAdmin = false,
): boolean {
  if (!uid || payment.createdBy !== uid) return false;
  return isAdmin || Boolean(myPersonId && payment.personId === myPersonId);
}

export function canEditPayment(
  payment: Pick<PaymentRecord, "createdBy" | "personId" | "createdAt">,
  uid: string | null | undefined,
  myPersonId: string | null | undefined,
  now: number = Date.now(),
  isAdmin = false,
): boolean {
  if (!addedByMe(payment, uid, myPersonId, isAdmin)) return false;
  const created = payment.createdAt?.toMillis?.();
  if (typeof created !== "number") return false;
  return now - created < EDIT_WINDOW_MS;
}

/** Whoever added an entry can remove it at any time (mirrors the delete rule). */
export function canDeletePayment(
  payment: Pick<PaymentRecord, "createdBy" | "personId">,
  uid: string | null | undefined,
  myPersonId: string | null | undefined,
  isAdmin = false,
): boolean {
  return addedByMe(payment, uid, myPersonId, isAdmin);
}

/** Milliseconds left in the edit window (0 when locked). */
export function editTimeLeft(payment: Pick<PaymentRecord, "createdAt">, now: number = Date.now()): number {
  const created = payment.createdAt?.toMillis?.();
  if (typeof created !== "number") return 0;
  return Math.max(0, created + EDIT_WINDOW_MS - now);
}
