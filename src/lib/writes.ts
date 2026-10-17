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
