import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { ROSTER } from "@/lib/roster";

const ADMIN_UID = "admin-uid1";
const MEMBER_UID = "member-uid";
const STRANGER_UID = "stranger-uid";

let testEnv: RulesTestEnvironment;

function dbOf(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

function adminDb(): Firestore {
  return dbOf(
    testEnv.authenticatedContext(ADMIN_UID, {
      email: "admin@plotshare.local",
      email_verified: true,
    }),
  );
}

function memberDb(): Firestore {
  return dbOf(
    testEnv.authenticatedContext(MEMBER_UID, {
      email: "member@plotshare.local",
      email_verified: false,
    }),
  );
}

function verifiedDb(uid: string, email: string): Firestore {
  return dbOf(
    testEnv.authenticatedContext(uid, {
      email,
      email_verified: true,
    }),
  );
}

async function seedLedger(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = dbOf(context);
    for (const person of ROSTER) {
      await setDoc(doc(db, "people", person.id), {
        name: person.name,
        role: person.role,
        color: person.color,
        sortOrder: person.sortOrder,
        linkedUid: null,
        linkedLabel: "",
      });
    }
    const createdAt = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    await setDoc(doc(db, "users", ADMIN_UID), {
      email: "admin@plotshare.local",
      displayName: "Ananya Iyer",
      personId: "ananya",
      createdAt,
    });
    await setDoc(doc(db, "users", MEMBER_UID), {
      email: "member@plotshare.local",
      displayName: "Rohan Mehta",
      personId: "rohan",
      createdAt,
    });
    await setDoc(doc(db, "settings", "access"), {
      adminUids: [ADMIN_UID],
      createdAt,
    });
  });
}

function paymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    personId: "kavita",
    amountPaise: 250_000_000,
    date: Timestamp.fromDate(new Date("2026-03-12T12:00:00Z")),
    note: "First installment",
    createdBy: ADMIN_UID,
    updatedBy: ADMIN_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8180";
  const [hostname, portText] = host.split(":");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-plot-ledger",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: hostname ?? "127.0.0.1",
      port: Number(portText ?? "8180"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("default deny", () => {
  it("blocks unauthenticated reads and writes", async () => {
    const db = dbOf(testEnv.unauthenticatedContext());
    await assertFails(getDoc(doc(db, "payments", "pay1")));
    await assertFails(getDocs(collection(db, "people")));
    await assertFails(setDoc(doc(db, "payments", "pay1"), paymentPayload()));
    await assertFails(getDoc(doc(db, "secret", "notes")));
  });

  it("blocks a signed-in user who has no profile", async () => {
    await seedLedger();
    const db = dbOf(
      testEnv.authenticatedContext(STRANGER_UID, {
        email: "stranger@plotshare.local",
        email_verified: true,
      }),
    );
    await assertFails(getDocs(collection(db, "payments")));
    await assertFails(getDoc(doc(db, "people", "kavita")));
    await assertFails(setDoc(doc(db, "payments", "pay1"), paymentPayload()));
  });
});

describe("member read, admin write", () => {
  beforeEach(async () => {
    await seedLedger();
  });

  it("lets a member read the ledger but not another person's account", async () => {
    const db = memberDb();
    await assertSucceeds(getDocs(collection(db, "people")));
    await assertSucceeds(getDocs(collection(db, "payments")));
    await assertSucceeds(getDocs(collection(db, "audit")));
    await assertSucceeds(getDoc(doc(db, "settings", "access")));
    await assertSucceeds(getDoc(doc(db, "users", MEMBER_UID)));
    await assertFails(getDoc(doc(db, "users", ADMIN_UID)));
    await assertFails(getDocs(collection(db, "users")));
  });

  it("lets an admin list accounts", async () => {
    await assertSucceeds(getDocs(collection(adminDb(), "users")));
  });

  it("lets an admin record a homeowner payment and rejects bad amounts", async () => {
    const db = adminDb();
    await assertSucceeds(setDoc(doc(db, "payments", "pay-home"), paymentPayload({ personId: "suresh" })));
    await assertFails(setDoc(doc(db, "payments", "pay-float"), paymentPayload({ amountPaise: 10.5 })));
    await assertFails(setDoc(doc(db, "payments", "pay-zero"), paymentPayload({ amountPaise: 0 })));
    await assertFails(setDoc(doc(db, "payments", "pay-ghost"), paymentPayload({ personId: "nobody" })));
    await assertFails(setDoc(doc(db, "payments", "pay-extra"), paymentPayload({ role: "admin" })));
    await assertFails(
      setDoc(doc(db, "payments", "pay-note"), paymentPayload({ note: "x".repeat(501) })),
    );
  });

  it("stops members from creating, editing, or deleting payments", async () => {
    await assertSucceeds(setDoc(doc(adminDb(), "payments", "pay1"), paymentPayload()));
    const db = memberDb();
    await assertFails(setDoc(doc(db, "payments", "pay2"), paymentPayload({ createdBy: MEMBER_UID, updatedBy: MEMBER_UID })));
    await assertFails(deleteDoc(doc(db, "payments", "pay1")));
    await assertFails(
      updateDoc(doc(db, "payments", "pay1"), {
        note: "changed",
      }),
    );
  });

  it("keeps createdBy and createdAt immutable and allows a valid admin edit and delete", async () => {
    const db = adminDb();
    await assertSucceeds(setDoc(doc(db, "payments", "pay1"), paymentPayload()));
    const created = await getDoc(doc(db, "payments", "pay1"));
    const data = created.data();
    if (!data) throw new Error("payment missing");

    await assertSucceeds(
      updateDoc(doc(db, "payments", "pay1"), {
        personId: "kavita",
        amountPaise: 260_000_000,
        date: data.date,
        note: "Adjusted",
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedBy: ADMIN_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      updateDoc(doc(db, "payments", "pay1"), {
        createdBy: MEMBER_UID,
        updatedBy: ADMIN_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    await assertSucceeds(deleteDoc(doc(db, "payments", "pay1")));
  });

  it("writes an audit entry only for an admin, and never lets anyone edit it", async () => {
    const db = adminDb();
    await assertSucceeds(
      setDoc(doc(db, "audit", "audit1"), {
        action: "create",
        entity: "payment",
        entityId: "pay1",
        actorUid: ADMIN_UID,
        actorName: "Ananya Iyer",
        summary: "Recorded ₹25,00,000 for Kavita Shah",
        at: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "audit", "audit-spoof"), {
        action: "create",
        entity: "payment",
        entityId: "pay1",
        actorUid: ADMIN_UID,
        actorName: "Someone Else",
        summary: "Spoofed",
        at: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(db, "audit", "audit1"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(db, "audit", "audit1")));
    await assertFails(
      setDoc(doc(memberDb(), "audit", "audit-member"), {
        action: "create",
        entity: "payment",
        entityId: "pay1",
        actorUid: MEMBER_UID,
        actorName: "Rohan Mehta",
        summary: "Member tried to write history",
        at: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(memberDb(), "audit", "audit1")));
  });

  it("lets an admin edit a person and blocks creates, deletes, and member edits", async () => {
    const db = adminDb();
    await assertSucceeds(
      updateDoc(doc(db, "people", "kavita"), {
        name: "Kavita S. Shah",
        role: "contributor",
        color: "#c4a15a",
        sortOrder: 2,
        linkedUid: MEMBER_UID,
        linkedLabel: "Rohan Mehta",
      }),
    );
    await assertFails(setDoc(doc(db, "people", "seventh"), {
      name: "Seventh",
      role: "contributor",
      color: "#112233",
      sortOrder: 6,
      linkedUid: null,
      linkedLabel: "",
    }));
    await assertFails(deleteDoc(doc(db, "people", "kavita")));
    await assertFails(
      updateDoc(doc(memberDb(), "people", "kavita"), {
        name: "Taken",
      }),
    );
    await assertFails(
      updateDoc(doc(db, "people", "kavita"), {
        name: "Kavita Shah",
        role: "contributor",
        color: "green",
        sortOrder: 2,
        linkedUid: null,
        linkedLabel: "",
      }),
    );
  });
});

describe("accounts and admin bootstrap", () => {
  it("lets a person create only their own unlinked profile", async () => {
    const db = verifiedDb(STRANGER_UID, "stranger@plotshare.local");
    await assertSucceeds(
      setDoc(doc(db, "users", STRANGER_UID), {
        email: "stranger@plotshare.local",
        displayName: "Stranger",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "users", STRANGER_UID), {
        email: "stranger@plotshare.local",
        displayName: "Stranger",
        personId: null,
        role: "admin",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "users", "other-user-uid"), {
        email: "stranger@plotshare.local",
        displayName: "Stranger",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "users", STRANGER_UID), {
        email: "other@plotshare.local",
        displayName: "Stranger",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("lets the first verified member become the only admin, and nobody else overwrite that", async () => {
    const first = verifiedDb("first-user", "first@plotshare.local");
    await assertSucceeds(
      setDoc(doc(first, "users", "first-user"), {
        email: "first@plotshare.local",
        displayName: "First Admin",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(first, "settings", "access"), {
        adminUids: ["first-user"],
        createdAt: serverTimestamp(),
      }),
    );

    const second = verifiedDb("second-usr", "second@plotshare.local");
    await assertSucceeds(
      setDoc(doc(second, "users", "second-usr"), {
        email: "second@plotshare.local",
        displayName: "Second",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(second, "settings", "access"), {
        adminUids: ["second-usr"],
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(second, "settings", "access"), {
        adminUids: ["second-usr", "first-user"],
      }),
    );
  });

  it("lets the first account claim admin and rejects a bootstrap that names someone else", async () => {
    const unverified = dbOf(
      testEnv.authenticatedContext("unverified1", {
        email: "new@plotshare.local",
        email_verified: false,
      }),
    );
    await assertSucceeds(
      setDoc(doc(unverified, "users", "unverified1"), {
        email: "new@plotshare.local",
        displayName: "New Member",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(unverified, "settings", "access"), {
        adminUids: ["unverified1"],
        createdAt: serverTimestamp(),
      }),
    );

    await testEnv.clearFirestore();
    const verified = verifiedDb("verified-user", "verified@plotshare.local");
    await assertSucceeds(
      setDoc(doc(verified, "users", "verified-user"), {
        email: "verified@plotshare.local",
        displayName: "Verified",
        personId: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(verified, "settings", "access"), {
        adminUids: [MEMBER_UID],
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("lets an admin link a person and add another admin without removing themselves", async () => {
    await seedLedger();
    const db = adminDb();
    const member = await getDoc(doc(db, "users", MEMBER_UID));
    const memberData = member.data();
    if (!memberData) throw new Error("member missing");
    await assertSucceeds(
      updateDoc(doc(db, "users", MEMBER_UID), {
        ...memberData,
        personId: "kavita",
      }),
    );

    const self = memberDb();
    const selfSnap = await getDoc(doc(self, "users", MEMBER_UID));
    const selfData = selfSnap.data();
    if (!selfData) throw new Error("self missing");
    await assertFails(
      updateDoc(doc(self, "users", MEMBER_UID), {
        ...selfData,
        personId: "suresh",
      }),
    );

    const access = await getDoc(doc(db, "settings", "access"));
    const createdAt = access.data()?.createdAt;
    await assertSucceeds(
      updateDoc(doc(db, "settings", "access"), {
        adminUids: [ADMIN_UID, MEMBER_UID],
        createdAt,
      }),
    );
    await assertFails(
      updateDoc(doc(db, "settings", "access"), {
        adminUids: [MEMBER_UID],
        createdAt,
      }),
    );
  });
});
