import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { formatInrFromPaise, formatLedgerDate } from "../src/lib/ledger-math";
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_GOOGLE_SUB,
  DEMO_ADMIN_UID,
  DEMO_MEMBER_EMAIL,
  DEMO_MEMBER_GOOGLE_SUB,
  DEMO_MEMBER_UID,
  DEMO_PROJECT_ID,
  ROSTER,
} from "../src/lib/roster";

const LAKH = 100_000 * 100;

const samplePayments = [
  {
    id: "pay-ananya",
    personId: "ananya",
    amountPaise: 30 * LAKH,
    date: "2026-02-04",
    note: "Foundation and compound wall",
  },
  {
    id: "pay-rohan",
    personId: "rohan",
    amountPaise: 20 * LAKH,
    date: "2026-03-19",
    note: "Second call",
  },
  {
    id: "pay-kavita",
    personId: "kavita",
    amountPaise: 25 * LAKH,
    date: "2026-04-11",
    note: "Twenty-five lakh of the one crore contributor pool",
  },
  {
    id: "pay-arjun",
    personId: "arjun",
    amountPaise: 15 * LAKH,
    date: "2026-05-22",
    note: "Borewell and site prep",
  },
  {
    id: "pay-meera",
    personId: "meera",
    amountPaise: 10 * LAKH,
    date: "2026-07-08",
    note: "Balance of her share",
  },
  {
    id: "pay-suresh",
    personId: "suresh",
    amountPaise: 20 * LAKH,
    date: "2026-01-18",
    note: "Homeowner payment. Counted in the total, not in ownership.",
  },
];

function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? DEMO_PROJECT_ID;
}

function emulatorHost(envName: string, fallback: string): string {
  return process.env[envName] ?? fallback;
}

export async function seedEmulator(options: { withSamplePayments: boolean }): Promise<void> {
  const id = projectId();
  if (!id.startsWith("demo-")) {
    throw new Error(`Refusing to seed project "${id}". This repo only seeds demo-* emulator projects.`);
  }

  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8180");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9199");

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authClear = await fetch(`http://${authHost}/emulator/v1/projects/${id}/accounts`, { method: "DELETE" });
  if (!authClear.ok) {
    throw new Error(`Could not clear Auth emulator (${authClear.status}). Is it running on ${authHost}?`);
  }
  const firestoreClear = await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${id}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!firestoreClear.ok) {
    throw new Error(
      `Could not clear Firestore emulator (${firestoreClear.status}). Is it running on ${firestoreHost}?`,
    );
  }

  const app = getApps()[0] ?? initializeApp({ projectId: id });
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Google-provider users (the app is Google sign-in only). The app's emulator test
  // buttons sign in with an unsigned Google ID token whose `sub` matches these.
  const imported = await auth.importUsers([
    {
      uid: DEMO_ADMIN_UID,
      email: DEMO_ADMIN_EMAIL,
      emailVerified: true,
      displayName: "Ananya Iyer",
      providerData: [{ uid: DEMO_ADMIN_GOOGLE_SUB, providerId: "google.com", email: DEMO_ADMIN_EMAIL, displayName: "Ananya Iyer" }],
    },
    {
      uid: DEMO_MEMBER_UID,
      email: DEMO_MEMBER_EMAIL,
      emailVerified: true,
      displayName: "Rohan Mehta",
      providerData: [{ uid: DEMO_MEMBER_GOOGLE_SUB, providerId: "google.com", email: DEMO_MEMBER_EMAIL, displayName: "Rohan Mehta" }],
    },
  ]);
  if (imported.failureCount > 0) throw new Error(`Could not import demo users: ${imported.errors.map((e) => e.error.message).join("; ")}`);

  const createdAt = Timestamp.fromDate(new Date("2026-01-01T12:00:00Z"));
  const batch = db.batch();
  for (const person of ROSTER) {
    const linkedUid = person.id === "ananya" ? DEMO_ADMIN_UID : person.id === "rohan" ? DEMO_MEMBER_UID : null;
    const linkedLabel = person.id === "ananya" ? "Ananya Iyer" : person.id === "rohan" ? "Rohan Mehta" : "";
    batch.set(db.collection("people").doc(person.id), {
      name: person.name,
      role: person.role,
      color: person.color,
      sortOrder: person.sortOrder,
      linkedUid,
      linkedLabel,
    });
  }
  batch.set(db.collection("users").doc(DEMO_ADMIN_UID), {
    email: DEMO_ADMIN_EMAIL,
    displayName: "Ananya Iyer",
    personId: "ananya",
    createdAt,
  });
  batch.set(db.collection("users").doc(DEMO_MEMBER_UID), {
    email: DEMO_MEMBER_EMAIL,
    displayName: "Rohan Mehta",
    personId: "rohan",
    createdAt,
  });
  batch.set(db.collection("settings").doc("access"), {
    adminUids: [DEMO_ADMIN_UID],
    createdAt,
  });

  if (options.withSamplePayments) {
    for (const payment of samplePayments) {
      const [year, month, day] = payment.date.split("-").map(Number);
      const date = Timestamp.fromDate(new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12)));
      batch.set(db.collection("payments").doc(payment.id), {
        personId: payment.personId,
        amountPaise: payment.amountPaise,
        date,
        note: payment.note,
        createdBy: DEMO_ADMIN_UID,
        updatedBy: DEMO_ADMIN_UID,
        createdAt,
        updatedAt: date,
      });
      batch.set(db.collection("audit").doc(`audit-${payment.id}`), {
        action: "create",
        entity: "payment",
        entityId: payment.id,
        actorUid: DEMO_ADMIN_UID,
        actorName: "Ananya Iyer",
        summary: `Recorded ${formatInrFromPaise(payment.amountPaise)} for ${
          ROSTER.find((person) => person.id === payment.personId)?.name ?? payment.personId
        } on ${formatLedgerDate(date.toDate())}. ${payment.note}`,
        at: date,
      });
    }
  }

  await batch.commit();
}

const isDirect = process.argv[1]?.includes("seed");
if (isDirect) {
  seedEmulator({ withSamplePayments: process.argv.includes("--with-payments") })
    .then(() => {
      console.log("Seeded the local Firebase emulators.");
      console.log(`Admin  ${DEMO_ADMIN_EMAIL} (emulator Google test button)`);
      console.log(`Member ${DEMO_MEMBER_EMAIL} (emulator Google test button)`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
