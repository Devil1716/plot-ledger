import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

let pendingDisplayName: string | null = null;

export function queueProfileName(name: string): void {
  pendingDisplayName = name.trim().slice(0, 80) || null;
}

export function profileName(user: User): string {
  if (pendingDisplayName) {
    const queued = pendingDisplayName;
    pendingDisplayName = null;
    return queued;
  }
  const display = user.displayName?.trim();
  if (display) return display.slice(0, 80);
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local.slice(0, 80);
  return "Member";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "";
}

export async function ensureProfile(db: Firestore, user: User): Promise<void> {
  if (!user.email) {
    throw new Error("This account has no email address, so it can't join the ledger.");
  }
  const ref = doc(db, "users", user.uid);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) return;
      transaction.set(ref, {
        email: user.email,
        displayName: profileName(user),
        personId: null,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    throw error;
  }
}

export async function tryBootstrapAdmin(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, "settings", "access");
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  try {
    await setDoc(ref, {
      adminUids: [user.uid],
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    const code = errorCode(error);
    if (code.includes("permission-denied") || code.includes("already-exists")) return;
    throw error;
  }
}
