import { GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut, type Auth } from "firebase/auth";
import { isNativeApp } from "@/lib/native";
import { usingEmulators } from "@/lib/firebase";

/**
 * Google is the only way in.
 * - Android / iOS app: native Google account picker (Credential Manager on Android) via
 *   @capacitor-firebase/authentication with skipNativeAuth, then the ID token signs in the
 *   Firebase JS SDK, which the rest of the app uses.
 * - Web: Google popup.
 */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  if (isNativeApp()) {
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error("Google sign-in didn't return an account. Try again.");
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, result.credential?.accessToken));
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

export async function signOutEverywhere(auth: Auth): Promise<void> {
  if (isNativeApp()) {
    try {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      // forget the picked Google account so "Continue with Google" asks again
      await FirebaseAuthentication.signOut();
    } catch {
      // not signed in natively; fine
    }
  }
  await signOut(auth);
}

/**
 * Emulator only (local dev + Playwright): the Auth emulator accepts an unsigned Google ID
 * token, so tests can sign in as a "Google" user without a real Google account.
 * Never available against a real Firebase project.
 */
export async function signInWithFakeGoogle(auth: Auth, account: { sub: string; email: string; name: string }): Promise<void> {
  if (!usingEmulators()) throw new Error("Test sign-in only works with the Firebase emulators.");
  const token = JSON.stringify({ sub: account.sub, email: account.email, email_verified: true, name: account.name });
  await signInWithCredential(auth, GoogleAuthProvider.credential(token));
}
