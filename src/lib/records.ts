import { Timestamp, type DocumentData } from "firebase/firestore";
import type { PersonRole } from "@/lib/ledger-math";

export interface PersonRecord {
  id: string;
  name: string;
  role: PersonRole;
  color: string;
  sortOrder: number;
  linkedUid: string | null;
  linkedLabel: string;
}

export interface PaymentRecord {
  id: string;
  personId: string;
  amountPaise: number;
  date: Date;
  note: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
}

export interface AuditRecord {
  id: string;
  action: "create" | "update" | "delete";
  entity: "payment" | "person" | "access";
  entityId: string;
  actorUid: string;
  actorName: string;
  summary: string;
  at: Date;
}

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  personId: string | null;
}

function asTimestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (
    value &&
    typeof value === "object" &&
    "seconds" in value &&
    "nanoseconds" in value &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number"
  ) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function asRole(value: unknown): PersonRole | null {
  return value === "contributor" || value === "homeowner" ? value : null;
}

export function parsePerson(id: string, data: DocumentData | undefined): PersonRecord | null {
  if (!data) return null;
  const role = asRole(data.role);
  if (!role || typeof data.name !== "string" || typeof data.color !== "string") return null;
  if (typeof data.sortOrder !== "number") return null;
  return {
    id,
    name: data.name,
    role,
    color: data.color,
    sortOrder: data.sortOrder,
    linkedUid: typeof data.linkedUid === "string" ? data.linkedUid : null,
    linkedLabel: typeof data.linkedLabel === "string" ? data.linkedLabel : "",
  };
}

export function parsePayment(id: string, data: DocumentData | undefined): PaymentRecord | null {
  if (!data) return null;
  const date = asDate(data.date);
  const createdAt = asTimestamp(data.createdAt);
  if (!date || !createdAt || typeof data.personId !== "string") return null;
  if (!Number.isSafeInteger(data.amountPaise) || data.amountPaise <= 0) return null;
  return {
    id,
    personId: data.personId,
    amountPaise: data.amountPaise,
    date,
    note: typeof data.note === "string" ? data.note : "",
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
  };
}

export function parseAudit(id: string, data: DocumentData | undefined): AuditRecord | null {
  if (!data) return null;
  const at = asDate(data.at);
  if (!at || typeof data.summary !== "string") return null;
  if (data.action !== "create" && data.action !== "update" && data.action !== "delete") return null;
  if (data.entity !== "payment" && data.entity !== "person" && data.entity !== "access") return null;
  return {
    id,
    action: data.action,
    entity: data.entity,
    entityId: typeof data.entityId === "string" ? data.entityId : "",
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    actorName: typeof data.actorName === "string" ? data.actorName : "Someone",
    summary: data.summary,
    at,
  };
}

export function parseUser(uid: string, data: DocumentData | undefined): UserRecord | null {
  if (!data || typeof data.email !== "string" || typeof data.displayName !== "string") return null;
  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    personId: typeof data.personId === "string" ? data.personId : null,
  };
}
