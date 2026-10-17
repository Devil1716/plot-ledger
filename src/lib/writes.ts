import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  formatInrFromPaise,
  formatLedgerDate,
  planRoleChange,
  type PersonRole,
} from "@/lib/ledger-math";
import type { PersonRecord, UserRecord } from "@/lib/records";

export interface Actor {
  uid: string;
  name: string;
}

export interface PaymentInput {
  personId: string;
  amountPaise: number;
  date: Date;
  note: string;
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function audit(
  db: Firestore,
  actor: Actor,
  entry: {
    action: "create" | "update" | "delete";
    entity: "payment" | "person" | "access";
    entityId: string;
    summary: string;
  },
) {
  return {
    ref: doc(collection(db, "audit")),
    data: {
      ...entry,
      actorUid: actor.uid,
      actorName: actor.name,
      summary: clip(entry.summary, 400),
      at: serverTimestamp(),
    },
  };
}

function paymentSummary(verb: string, personName: string, amountPaise: number, date: Date, note: string): string {
  const dated = `${verb} ${formatInrFromPaise(amountPaise)} for ${personName} on ${formatLedgerDate(date)}`;
  return note.trim() ? `${dated}. ${note.trim()}` : dated;
}

export async function createPayment(
  db: Firestore,
  actor: Actor,
  people: PersonRecord[],
  input: PaymentInput,
): Promise<void> {
  const person = people.find((item) => item.id === input.personId);
  if (!person) throw new Error("Choose a person on the roster.");
  const ref = doc(collection(db, "payments"));
  const batch = writeBatch(db);
  batch.set(ref, {
    personId: input.personId,
    amountPaise: input.amountPaise,
    date: Timestamp.fromDate(input.date),
    note: clip(input.note, 500),
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const trail = audit(db, actor, {
    action: "create",
    entity: "payment",
    entityId: ref.id,
    summary: paymentSummary("Recorded", person.name, input.amountPaise, input.date, input.note),
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
}

export async function updatePayment(
  db: Firestore,
  actor: Actor,
  people: PersonRecord[],
  paymentId: string,
  current: { createdBy: string; createdAt: Timestamp },
  input: PaymentInput,
): Promise<void> {
  const person = people.find((item) => item.id === input.personId);
  if (!person) throw new Error("Choose a person on the roster.");
  const ref = doc(db, "payments", paymentId);
  const batch = writeBatch(db);
  batch.update(ref, {
    personId: input.personId,
    amountPaise: input.amountPaise,
    date: Timestamp.fromDate(input.date),
    note: clip(input.note, 500),
    createdBy: current.createdBy,
    createdAt: current.createdAt,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  const trail = audit(db, actor, {
    action: "update",
    entity: "payment",
    entityId: paymentId,
    summary: paymentSummary("Edited to", person.name, input.amountPaise, input.date, input.note),
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
}

export async function deletePayment(
  db: Firestore,
  actor: Actor,
  people: PersonRecord[],
  payment: { id: string; personId: string; amountPaise: number; date: Date },
): Promise<void> {
  const person = people.find((item) => item.id === payment.personId);
  const name = person?.name ?? "someone";
  const batch = writeBatch(db);
  batch.delete(doc(db, "payments", payment.id));
  const trail = audit(db, actor, {
    action: "delete",
    entity: "payment",
    entityId: payment.id,
    summary: paymentSummary("Removed", name, payment.amountPaise, payment.date, ""),
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
}

export interface PersonEdit {
  personId: string;
  name: string;
  role: PersonRole;
  linkedUid: string | null;
}

export async function savePerson(
  db: Firestore,
  actor: Actor,
  people: PersonRecord[],
  accounts: UserRecord[],
  edit: PersonEdit,
): Promise<void> {
  const person = people.find((item) => item.id === edit.personId);
  if (!person) throw new Error("That person is not on the roster.");
  const name = clip(edit.name, 80);
  if (!name) throw new Error("Name is required.");
  const linkedAccount = edit.linkedUid
    ? accounts.find((account) => account.uid === edit.linkedUid)
    : undefined;
  if (edit.linkedUid && !linkedAccount) throw new Error("That account is not on the ledger yet.");

  const roleById = new Map(people.map((item) => [item.id, item.role]));
  for (const change of planRoleChange(people, edit.personId, edit.role)) {
    roleById.set(change.id, change.role);
  }

  const linkById = new Map(people.map((item) => [item.id, item.linkedUid]));
  if (edit.linkedUid) {
    for (const [id, uid] of linkById) {
      if (uid === edit.linkedUid) linkById.set(id, null);
    }
  }
  linkById.set(edit.personId, edit.linkedUid);

  const batch = writeBatch(db);
  for (const target of people) {
    const nextRole = roleById.get(target.id) ?? target.role;
    const nextLink = linkById.get(target.id) ?? null;
    const nextName = target.id === edit.personId ? name : target.name;
    const nextLabel = accounts.find((account) => account.uid === nextLink)?.displayName ?? "";
    const changed =
      nextRole !== target.role ||
      nextLink !== target.linkedUid ||
      nextName !== target.name ||
      nextLabel !== target.linkedLabel;
    if (!changed) continue;
    batch.update(doc(db, "people", target.id), {
      name: nextName,
      role: nextRole,
      color: target.color,
      sortOrder: target.sortOrder,
      linkedUid: nextLink,
      linkedLabel: nextLabel,
    });
  }

  for (const account of accounts) {
    const nextPersonId = [...linkById.entries()].find(([, uid]) => uid === account.uid)?.[0] ?? null;
    if (nextPersonId !== account.personId) {
      batch.update(doc(db, "users", account.uid), { personId: nextPersonId });
    }
  }

  const trail = audit(db, actor, {
    action: "update",
    entity: "person",
    entityId: edit.personId,
    summary: `Updated ${name} (${edit.role}${linkedAccount ? `, linked to ${linkedAccount.displayName}` : ", not linked"})`,
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
}

export async function updateAdmins(
  db: Firestore,
  actor: Actor,
  currentCreatedAt: Timestamp,
  adminUids: string[],
): Promise<void> {
  if (!adminUids.includes(actor.uid)) {
    throw new Error("Keep yourself as an admin so the ledger is not locked.");
  }
  if (adminUids.length > 6) throw new Error("At most six admins.");
  const batch = writeBatch(db);
  batch.update(doc(db, "settings", "access"), {
    adminUids,
    createdAt: currentCreatedAt,
  });
  const trail = audit(db, actor, {
    action: "update",
    entity: "access",
    entityId: "access",
    summary: `Updated admins (${adminUids.length} ${adminUids.length === 1 ? "person" : "people"})`,
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
}

const PALETTE = ["#7AA7F5", "#F29A85", "#EBC06C", "#A996F2", "#E38DB4", "#6FD3B8", "#F5B26B", "#8FC1E3", "#C9A0DC", "#9ED98B"];

/** Roster id for a person created from an account: stable, rule-safe ([A-Za-z0-9_-]). */
export function personIdForAccount(uid: string): string {
  return `p-${uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30)}`;
}

export type Approval =
  | { mode: "new"; role: PersonRole }
  | { mode: "link"; personId: string };

/**
 * Admin approves a waiting Google account: either adds them to the roster as a new person
 * (name + photo from their Google profile) or links them to an existing unlinked person.
 * Money is never touched here.
 */
export async function approveAccount(
  db: Firestore,
  actor: Actor,
  people: PersonRecord[],
  accounts: UserRecord[],
  account: UserRecord,
  approval: Approval,
): Promise<string> {
  if (account.personId) throw new Error(`${account.displayName} is already approved.`);
  if (approval.mode === "link") {
    const person = people.find((item) => item.id === approval.personId);
    if (!person) throw new Error("That person is not on the roster.");
    if (person.linkedUid) throw new Error(`${person.name} is already linked to someone.`);
    await savePerson(db, actor, people, accounts, {
      personId: person.id,
      name: person.name,
      role: person.role,
      linkedUid: account.uid,
    });
    return person.id;
  }

  const personId = personIdForAccount(account.uid);
  if (people.some((item) => item.id === personId)) throw new Error("This account already has a roster entry.");
  const sortOrder = Math.min(50, people.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0));
  const used = new Set(people.map((item) => item.color.toLowerCase()));
  const color = PALETTE.find((item) => !used.has(item.toLowerCase())) ?? PALETTE[people.length % PALETTE.length];
  const name = clip(account.displayName, 80) || "Member";

  const batch = writeBatch(db);
  // one homeowner at a time: approving someone as homeowner makes the previous one a contributor
  if (approval.role === "homeowner") {
    for (const other of people.filter((item) => item.role === "homeowner")) {
      batch.update(doc(db, "people", other.id), { role: "contributor" });
    }
  }
  batch.set(doc(db, "people", personId), {
    name,
    role: approval.role,
    color,
    sortOrder,
    linkedUid: account.uid,
    linkedLabel: name,
    ...(account.photoURL ? { photoURL: account.photoURL.slice(0, 2048) } : {}),
  });
  batch.update(doc(db, "users", account.uid), { personId });
  const trail = audit(db, actor, {
    action: "create",
    entity: "person",
    entityId: personId,
    summary: `Approved ${name} and added them to the roster as ${approval.role === "homeowner" ? "the homeowner (0% share)" : "a contributor"}`,
  });
  batch.set(trail.ref, trail.data);
  await batch.commit();
  return personId;
}
