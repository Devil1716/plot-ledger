import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

/** Google account name (fallback: the part of the email before @). */
export function profileName(user: User): string {
  const display = user.displayName?.trim();
  if (display) return display.slice(0, 80);
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local.slice(0, 80);
  return "Member";
}

export function profilePhoto(user: User): string | null {
  const url = (user.photoURL || user.providerData.find((item) => item.providerId === "google.com")?.photoURL)?.trim();
  return url && url.length <= 2048 ? googlePhotoAtSize(url) : null;
}

/** Google profile photos end in "=s96-c"; ask for a sharper one for avatars. */
export function googlePhotoAtSize(url: string, size = 256): string {
  return /googleusercontent\.com\//.test(url) ? url.replace(/=s\d+(-c)?$/, `=s${size}-c`) : url;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "";
}

/**
 * Creates users/{uid} from the Google profile on first sign-in (waiting for approval:
 * personId null), and keeps the name and photo in sync with Google afterwards.
 */
export async function ensureProfile(db: Firestore, user: User): Promise<void> {
  if (!user.email) {
    throw new Error("This Google account has no email address, so it can't join the ledger.");
  }
  const ref = doc(db, "users", user.uid);
  const displayName = profileName(user);
  const photoURL = profilePhoto(user);
  let existing: { displayName?: unknown; photoURL?: unknown } | null = null;
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) {
        existing = snap.data();
        return;
      }
      transaction.set(ref, {
        email: user.email,
        displayName,
        photoURL,
        personId: null,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw error;
    existing = snap.data();
  }
  const current = existing as { displayName?: unknown; photoURL?: unknown } | null;
  if (current && (current.displayName !== displayName || (current.photoURL ?? null) !== photoURL)) {
    // best effort: a stale name/photo is not worth blocking sign-in for
    await updateDoc(ref, { displayName, photoURL }).catch(() => undefined);
  }
}

/** One-time "claim admin": only works while no admin exists (enforced by Firestore rules). */
export async function claimAdmin(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, "settings", "access");
  const snap = await getDoc(ref);
  if (snap.exists()) throw new Error("This group already has an admin.");
  try {
    await setDoc(ref, { adminUids: [user.uid], createdAt: serverTimestamp() });
  } catch (error) {
    if (errorCode(error).includes("permission-denied")) throw new Error("Someone already claimed admin.");
    throw error;
  }
}
