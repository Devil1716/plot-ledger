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
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { ROSTER } from "@/lib/roster";

const ADMIN_UID = "admin-uid1";
const MEMBER_UID = "member-uid";
const STRANGER_UID = "stranger-uid";
const UNLINKED_UID = "unlinked-uid";

let testEnv: RulesTestEnvironment;

function dbOf(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

/** A Google sign-in token (the only provider the app offers). */
function google(email: string, verified = true) {
  return { email, email_verified: verified, firebase: { sign_in_provider: "google.com" } } as never;
}

function adminDb(): Firestore {
  return dbOf(testEnv.authenticatedContext(ADMIN_UID, google("admin@plotshare.local")));
}

function memberDb(): Firestore {
  return dbOf(testEnv.authenticatedContext(MEMBER_UID, google("member@plotshare.local")));
}

function unlinkedDb(): Firestore {
  return dbOf(testEnv.authenticatedContext(UNLINKED_UID, google("new@plotshare.local")));
}

function verifiedDb(uid: string, email: string): Firestore {
  return dbOf(testEnv.authenticatedContext(uid, google(email)));
}

/** Email/password sign-in: the provider still exists on the project, but rules refuse it. */
function passwordDb(uid: string, email: string): Firestore {
  return dbOf(
    testEnv.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: "password" } } as never),
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
        linkedUid: person.id === "ananya" ? ADMIN_UID : person.id === "rohan" ? MEMBER_UID : null,
        linkedLabel: person.id === "ananya" ? "Ananya Iyer" : person.id === "rohan" ? "Rohan Mehta" : "",
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
    await setDoc(doc(db, "users", UNLINKED_UID), {
      email: "new@plotshare.local",
      displayName: "New Person",
      personId: null,
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

function payment(personId: string, uid: string, overrides: Record<string, unknown> = {}) {
  return paymentPayload({ personId, createdBy: uid, updatedBy: uid, ...overrides });
}

async function seedPayment(id: string, personId: string, uid: string, createdAt: Date): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const at = Timestamp.fromDate(createdAt);
    await setDoc(doc(dbOf(context), "payments", id), payment(personId, uid, { createdAt: at, updatedAt: at }));
  });
}

function auditEntry(overrides: Record<string, unknown> = {}) {
  return {
    action: "create",
    entity: "payment",
    entityId: "pay1",
    actorUid: MEMBER_UID,
    actorName: "Rohan Mehta",
    summary: "Recorded ₹25,00,000 for Rohan Mehta",
    at: serverTimestamp(),
    ...overrides,
  };
}

const HOURS = 60 * 60 * 1000;

describe("reading the ledger", () => {
  beforeEach(async () => {
    await seedLedger();
    await seedPayment("pay-rohan", "rohan", MEMBER_UID, new Date());
  });

  it("lets a linked member read every payment, person and share, but not other accounts", async () => {
    const db = memberDb();
    await assertSucceeds(getDocs(collection(db, "people")));
    await assertSucceeds(getDocs(collection(db, "payments")));
    await assertSucceeds(getDoc(doc(db, "payments", "pay-rohan")));
    await assertSucceeds(getDocs(collection(db, "audit")));
    await assertSucceeds(getDoc(doc(db, "settings", "access")));
    await assertSucceeds(getDoc(doc(db, "users", MEMBER_UID)));
    await assertFails(getDoc(doc(db, "users", ADMIN_UID)));
    await assertFails(getDocs(collection(db, "users")));
    // the admin (linked to Ananya) reads Rohan's payment too
    await assertSucceeds(getDoc(doc(adminDb(), "payments", "pay-rohan")));
  });

  it("lets an admin list accounts", async () => {
    await assertSucceeds(getDocs(collection(adminDb(), "users")));
  });

  it("keeps an unlinked account out of the ledger (only its own profile and the admin list)", async () => {
    const db = unlinkedDb();
    await assertSucceeds(getDoc(doc(db, "users", UNLINKED_UID)));
    await assertSucceeds(getDoc(doc(db, "settings", "access")));
    await assertFails(getDocs(collection(db, "payments")));
    await assertFails(getDoc(doc(db, "payments", "pay-rohan")));
    await assertFails(getDocs(collection(db, "people")));
    await assertFails(getDocs(collection(db, "audit")));
  });

  it("treats a half-done link (profile names a person who doesn't link back) as unlinked", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(dbOf(context), "users", UNLINKED_UID), { personId: "kavita" });
    });
    const db = unlinkedDb();
    await assertFails(getDocs(collection(db, "payments")));
    await assertFails(setDoc(doc(db, "payments", "pay-k"), payment("kavita", UNLINKED_UID)));
  });
});

describe("recording payments: only for yourself", () => {
  beforeEach(async () => {
    await seedLedger();
  });

  it("lets a linked member record their own payment", async () => {
    await assertSucceeds(setDoc(doc(memberDb(), "payments", "pay1"), payment("rohan", MEMBER_UID)));
  });

  it("lets the admin record a payment for the person they are linked to", async () => {
    await assertSucceeds(setDoc(doc(adminDb(), "payments", "pay1"), payment("ananya", ADMIN_UID)));
  });

  it("denies a member recording money for somebody else", async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, "payments", "pay1"), payment("kavita", MEMBER_UID)));
    await assertFails(setDoc(doc(db, "payments", "pay2"), payment("ananya", MEMBER_UID)));
    await assertFails(setDoc(doc(db, "payments", "pay3"), payment("suresh", MEMBER_UID)));
  });

  it("denies the admin recording money for somebody else", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, "payments", "pay1"), payment("kavita", ADMIN_UID)));
    await assertFails(setDoc(doc(db, "payments", "pay2"), payment("rohan", ADMIN_UID)));
    await assertFails(setDoc(doc(db, "payments", "pay3"), payment("suresh", ADMIN_UID)));
  });

  it("denies an unlinked account recording anything", async () => {
    const db = unlinkedDb();
    await assertFails(setDoc(doc(db, "payments", "pay1"), payment("kavita", UNLINKED_UID)));
  });

  it("requires createdBy and updatedBy to be the signer", async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, "payments", "pay1"), payment("rohan", ADMIN_UID)));
    await assertFails(setDoc(doc(db, "payments", "pay2"), payment("rohan", MEMBER_UID, { updatedBy: ADMIN_UID })));
  });

  it("rejects bad amounts, dates and extra fields", async () => {
    const db = memberDb();
    const bad: Array<Record<string, unknown>> = [
      { amountPaise: 0 },
      { amountPaise: -500 },
      { amountPaise: 10.5 },
      { amountPaise: "100000" },
      { amountPaise: 10_000_000_001 },
      { date: Timestamp.fromDate(new Date(Date.now() + 10 * 24 * HOURS)) },
      { date: Timestamp.fromDate(new Date("1999-12-31T00:00:00Z")) },
      { note: "x".repeat(501) },
      { role: "admin" },
    ];
    for (const [index, overrides] of bad.entries()) {
      await assertFails(setDoc(doc(db, "payments", `bad-${index}`), payment("rohan", MEMBER_UID, overrides)));
    }
  });
});

describe("editing and deleting payments", () => {
  beforeEach(async () => {
    await seedLedger();
    await seedPayment("own-new", "rohan", MEMBER_UID, new Date(Date.now() - HOURS));
    await seedPayment("own-old", "rohan", MEMBER_UID, new Date(Date.now() - 30 * HOURS));
    await seedPayment("admin-new", "ananya", ADMIN_UID, new Date(Date.now() - HOURS));
  });

  function edit(db: Firestore, id: string, changes: Record<string, unknown>) {
    return updateDoc(doc(db, "payments", id), { ...changes, updatedAt: serverTimestamp() });
  }

  it("lets the creator fix their own payment within 24 hours", async () => {
    await assertSucceeds(edit(memberDb(), "own-new", { amountPaise: 260_000_000, note: "Fixed", updatedBy: MEMBER_UID }));
  });

  it("never lets the payer change who the payment is for, or who created it", async () => {
    await assertFails(edit(memberDb(), "own-new", { personId: "kavita", updatedBy: MEMBER_UID }));
    await assertFails(edit(memberDb(), "own-new", { createdBy: ADMIN_UID, updatedBy: MEMBER_UID }));
  });

  it("locks edits after 24 hours, but the creator can still delete their own entry", async () => {
    await assertFails(edit(memberDb(), "own-old", { note: "late edit", updatedBy: MEMBER_UID }));
    await assertFails(deleteDoc(doc(adminDb(), "payments", "own-old")));
    await assertSucceeds(deleteDoc(doc(memberDb(), "payments", "own-old")));
  });

  it("denies editing or deleting someone else's payment, admin included", async () => {
    await assertFails(edit(adminDb(), "own-new", { note: "admin edit", updatedBy: ADMIN_UID }));
    await assertFails(deleteDoc(doc(adminDb(), "payments", "own-new")));
    await assertFails(edit(memberDb(), "admin-new", { note: "member edit", updatedBy: MEMBER_UID }));
    await assertFails(deleteDoc(doc(memberDb(), "payments", "admin-new")));
    await assertFails(deleteDoc(doc(unlinkedDb(), "payments", "own-new")));
  });

  it("lets the creator delete their own recent payment", async () => {
    await assertSucceeds(deleteDoc(doc(memberDb(), "payments", "own-new")));
  });
});

describe("audit trail", () => {
  beforeEach(async () => {
    await seedLedger();
  });

  it("lets a member log their own payment in the same batch, and never edit the log", async () => {
    const db = memberDb();
    const batch = writeBatch(db);
    batch.set(doc(db, "payments", "pay1"), payment("rohan", MEMBER_UID));
    batch.set(doc(db, "audit", "audit1"), auditEntry());
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(adminDb(), "audit", "audit1")));
    await assertFails(updateDoc(doc(db, "audit", "audit1"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(db, "audit", "audit1")));
    await assertFails(deleteDoc(doc(adminDb(), "audit", "audit1")));
  });

  it("logs a delete only when the payer's payment is really removed", async () => {
    await seedPayment("pay1", "rohan", MEMBER_UID, new Date());
    const db = memberDb();
    await assertFails(setDoc(doc(db, "audit", "fake-delete"), auditEntry({ action: "delete" })));
    const batch = writeBatch(db);
    batch.delete(doc(db, "payments", "pay1"));
    batch.set(doc(db, "audit", "audit-del"), auditEntry({ action: "delete" }));
    await assertSucceeds(batch.commit());
  });

  it("rejects audit entries about other people's payments, spoofed names, or roster changes by members", async () => {
    await seedPayment("pay-ananya", "ananya", ADMIN_UID, new Date());
    const db = memberDb();
    await assertFails(setDoc(doc(db, "audit", "a1"), auditEntry({ entityId: "pay-ananya", action: "update" })));
    await assertFails(setDoc(doc(db, "audit", "a2"), auditEntry({ entityId: "missing" })));
    await assertFails(setDoc(doc(db, "audit", "a3"), auditEntry({ entity: "person", entityId: "rohan", action: "update" })));
    const batch = writeBatch(db);
    batch.set(doc(db, "payments", "pay2"), payment("rohan", MEMBER_UID));
    batch.set(doc(db, "audit", "a4"), auditEntry({ entityId: "pay2", actorName: "Someone Else" }));
    await assertFails(batch.commit());
  });

  it("lets an admin log roster changes", async () => {
    await assertSucceeds(
      setDoc(
        doc(adminDb(), "audit", "audit-person"),
        auditEntry({ entity: "person", entityId: "kavita", action: "update", actorUid: ADMIN_UID, actorName: "Ananya Iyer", summary: "Updated Kavita" }),
      ),
    );
  });
});

describe("roster and linking (admin)", () => {
  beforeEach(async () => {
    await seedLedger();
  });

  it("lets an admin edit a person (including making them the 0% homeowner), and blocks deletes and member edits", async () => {
    const db = adminDb();
    await assertSucceeds(
      updateDoc(doc(db, "people", "kavita"), {
        name: "Kavita S. Shah",
        role: "homeowner",
        color: "#c4a15a",
        sortOrder: 2,
        linkedUid: null,
        linkedLabel: "",
      }),
    );
    await assertFails(deleteDoc(doc(db, "people", "kavita")));
    await assertFails(updateDoc(doc(memberDb(), "people", "kavita"), { name: "Taken" }));
    await assertFails(updateDoc(doc(db, "people", "kavita"), { color: "green" }));
    await assertFails(updateDoc(doc(db, "people", "kavita"), { role: "owner" }));
  });

  it("lets only an admin add a roster person", async () => {
    const person = { name: "Seventh", role: "contributor", color: "#112233", sortOrder: 6, linkedUid: null, linkedLabel: "" };
    await assertSucceeds(setDoc(doc(adminDb(), "people", "seventh"), { ...person, photoURL: "https://lh3.googleusercontent.com/a/x" }));
    await assertFails(setDoc(doc(memberDb(), "people", "eighth"), person));
    await assertFails(setDoc(doc(unlinkedDb(), "people", "eighth"), person));
    await assertFails(setDoc(doc(adminDb(), "people", "bad id!"), person));
    await assertFails(setDoc(doc(adminDb(), "people", "ninth"), { ...person, linkedUid: "nobody-has-this-uid" }));
  });

  it("approves a waiting account by creating their roster person from the Google profile in one batch", async () => {
    await assertFails(getDocs(collection(unlinkedDb(), "payments")));
    const db = adminDb();
    const batch = writeBatch(db);
    batch.set(doc(db, "people", "p-unlinked"), {
      name: "New Person",
      role: "contributor",
      color: "#22aa88",
      sortOrder: 6,
      linkedUid: UNLINKED_UID,
      linkedLabel: "New Person",
      photoURL: "https://lh3.googleusercontent.com/a/new",
    });
    batch.update(doc(db, "users", UNLINKED_UID), { personId: "p-unlinked" });
    batch.set(doc(collection(db, "audit")), {
      action: "create",
      entity: "person",
      entityId: "p-unlinked",
      actorUid: ADMIN_UID,
      actorName: "Ananya Iyer",
      summary: "Approved New Person",
      at: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    // now a member: reads everything and can pay for themselves only
    await assertSucceeds(getDocs(collection(unlinkedDb(), "payments")));
    await assertSucceeds(
      setDoc(doc(collection(unlinkedDb(), "payments")), paymentPayload({ personId: "p-unlinked", createdBy: UNLINKED_UID, updatedBy: UNLINKED_UID })),
    );
    await assertFails(
      setDoc(doc(collection(unlinkedDb(), "payments")), paymentPayload({ personId: "rohan", createdBy: UNLINKED_UID, updatedBy: UNLINKED_UID })),
    );
  });

  it("lets people refresh their own Google name and photo, but nothing else", async () => {
    const self = memberDb();
    await assertSucceeds(updateDoc(doc(self, "users", MEMBER_UID), { displayName: "Rohan M.", photoURL: "https://lh3.googleusercontent.com/a/r" }));
    await assertFails(updateDoc(doc(self, "users", MEMBER_UID), { email: "else@plotshare.local" }));
    await assertFails(updateDoc(doc(self, "users", MEMBER_UID), { photoURL: 42 }));
  });

  it("never lets a member link themselves to a person", async () => {
    await assertFails(updateDoc(doc(memberDb(), "users", MEMBER_UID), { personId: "kavita" }));
    await assertFails(updateDoc(doc(unlinkedDb(), "users", UNLINKED_UID), { personId: "kavita" }));
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

  it("refuses email/password and unverified accounts: Google sign-in only", async () => {
    const profile = (email: string) => ({ email, displayName: "Someone", personId: null, createdAt: serverTimestamp() });
    const password = passwordDb("password-u1", "pw@plotshare.local");
    await assertFails(setDoc(doc(password, "users", "password-u1"), profile("pw@plotshare.local")));
    const unverified = dbOf(testEnv.authenticatedContext("unverified1", google("new@plotshare.local", false)));
    await assertFails(setDoc(doc(unverified, "users", "unverified1"), profile("new@plotshare.local")));
  });

  it("allows a one-time admin claim only while no admin exists, naming only yourself", async () => {
    const verified = verifiedDb("verified-user", "verified@plotshare.local");
    await assertSucceeds(
      setDoc(doc(verified, "users", "verified-user"), {
        email: "verified@plotshare.local",
        displayName: "Verified",
        photoURL: null,
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
    // a profile created under password sign-in (legacy) can't claim either
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(dbOf(context), "users", "password-u2"), {
        email: "pw2@plotshare.local",
        displayName: "Legacy",
        personId: null,
        createdAt: Timestamp.now(),
      });
    });
    await assertFails(
      setDoc(doc(passwordDb("password-u2", "pw2@plotshare.local"), "settings", "access"), {
        adminUids: ["password-u2"],
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(verified, "settings", "access"), {
        adminUids: ["verified-user"],
        createdAt: serverTimestamp(),
      }),
    );
    // the new admin puts themself on the roster (Google name + photo) and can then pay for themself
    const batch = writeBatch(verified);
    batch.set(doc(verified, "people", "p-verified-user"), {
      name: "Verified",
      role: "contributor",
      color: "#22aa88",
      sortOrder: 0,
      linkedUid: "verified-user",
      linkedLabel: "Verified",
      photoURL: "https://lh3.googleusercontent.com/a/v=s256-c",
    });
    batch.update(doc(verified, "users", "verified-user"), { personId: "p-verified-user" });
    batch.set(doc(collection(verified, "audit")), {
      action: "create",
      entity: "person",
      entityId: "p-verified-user",
      actorUid: "verified-user",
      actorName: "Verified",
      summary: "Approved Verified",
      at: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      setDoc(
        doc(collection(verified, "payments")),
        paymentPayload({ personId: "p-verified-user", createdBy: "verified-user", updatedBy: "verified-user" }),
      ),
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
    // revoke another admin
    await assertSucceeds(updateDoc(doc(db, "settings", "access"), { adminUids: [ADMIN_UID], createdAt }));
    // never zero admins, never hand the list to someone who isn't an admin yet
    await assertFails(updateDoc(doc(db, "settings", "access"), { adminUids: [], createdAt }));
    await assertFails(updateDoc(doc(db, "settings", "access"), { adminUids: [MEMBER_UID], createdAt }));
    // a member can't make themself admin
    await assertFails(updateDoc(doc(memberDb(), "settings", "access"), { adminUids: [ADMIN_UID, MEMBER_UID], createdAt }));
    // with two admins, one may step down
    await assertSucceeds(updateDoc(doc(db, "settings", "access"), { adminUids: [ADMIN_UID, MEMBER_UID], createdAt }));
    await assertSucceeds(updateDoc(doc(db, "settings", "access"), { adminUids: [MEMBER_UID], createdAt }));
    // ...after which they are no longer an admin
    await assertFails(updateDoc(doc(adminDb(), "settings", "access"), { adminUids: [MEMBER_UID, ADMIN_UID], createdAt }));
  });
});
