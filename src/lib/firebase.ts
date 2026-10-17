import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { emulatorHost } from "@/lib/native";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const globalState = globalThis as typeof globalThis & {
  __plotLedger?: FirebaseServices;
};

function requiredPublicEnv(
  name: string,
  value: string | undefined,
): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env.local.`);
  }
  return value;
}

export function usingEmulators(): boolean {
  return process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
}

export function getFirebase(): FirebaseServices {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only available in the browser.");
  }
  if (globalState.__plotLedger) return globalState.__plotLedger;

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: requiredPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      authDomain: requiredPublicEnv(
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      ),
      projectId: requiredPublicEnv(
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      ),
      appId: requiredPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    });
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (usingEmulators()) {
    const authUrl = new URL(process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9199");
    authUrl.hostname = emulatorHost(authUrl.hostname);
    connectAuthEmulator(auth, authUrl.origin, { disableWarnings: true });
    connectFirestoreEmulator(
      db,
      emulatorHost(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1"),
      Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8180"),
    );
  }

  const services = { app, auth, db };
  globalState.__plotLedger = services;
  return services;
}

export async function firebaseReady(): Promise<FirebaseServices> {
  const services = getFirebase();
  await setPersistence(services.auth, browserLocalPersistence);
  return services;
}
