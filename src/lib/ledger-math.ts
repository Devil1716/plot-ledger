export const TARGET_RUPEES = 12_000_000;
export const TARGET_PAISE = 1_200_000_000;
export const PERCENT_HUNDREDTHS_TOTAL = 10_000;
export const MAX_PAYMENT_PAISE = 10_000_000_000;

export type PersonRole = "contributor" | "homeowner";

export interface SharePerson {
  id: string;
  role: PersonRole;
}

export interface SharePayment {
  personId: string;
  amountPaise: number;
}

export interface ShareRow {
  personId: string;
  role: PersonRole;
  amountPaise: number;
  /** 10000 = 100.00%. Contributor rows sum to 10000 when anyone has paid. */
  percentHundredths: number;
}

const CRORE_RUPEES = 10_000_000;
const LAKH_RUPEES = 100_000;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

/**
 * Largest-remainder allocation. Equal remainders go to the earlier index.
 * Returns zeros when every weight is zero so callers never divide by zero.
 */
export function allocateLargestRemainder(weights: bigint[], totalUnits: bigint): bigint[] {
  if (totalUnits < 0n) {
    throw new Error("totalUnits must be non-negative");
  }
  const sum = weights.reduce((total, weight) => total + weight, 0n);
  if (sum === 0n || totalUnits === 0n) {
    return weights.map(() => 0n);
  }

  const floors: bigint[] = [];
  const remainders: { index: number; rem: bigint }[] = [];
  let allocated = 0n;

  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0n;
    if (weight < 0n) {
      throw new Error("weights must be non-negative");
    }
    const product = weight * totalUnits;
    const floor = product / sum;
    floors.push(floor);
    remainders.push({ index, rem: product % sum });
    allocated += floor;
  }

  let leftover = totalUnits - allocated;
  remainders.sort((a, b) => {
    if (a.rem === b.rem) return a.index - b.index;
    return a.rem > b.rem ? -1 : 1;
  });

  let cursor = 0;
  while (leftover > 0n) {
    const target = remainders[cursor % remainders.length];
    if (!target) break;
    floors[target.index] = (floors[target.index] ?? 0n) + 1n;
    leftover -= 1n;
    cursor += 1;
  }

  return floors;
}

export function computeShares(people: SharePerson[], payments: SharePayment[]): ShareRow[] {
  const totals = new Map<string, bigint>();
  for (const person of people) {
    totals.set(person.id, 0n);
  }

  for (const payment of payments) {
    assertNonNegativeSafeInteger(payment.amountPaise, "amountPaise");
    const current = totals.get(payment.personId);
    if (current === undefined) {
      throw new Error(`Unknown person: ${payment.personId}`);
    }
    const next = current + BigInt(payment.amountPaise);
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("amount exceeds safe integer range");
    }
    totals.set(payment.personId, next);
  }

  const contributors = people.filter((person) => person.role === "contributor");
  const weights = contributors.map((person) => totals.get(person.id) ?? 0n);
  const percentAlloc = allocateLargestRemainder(weights, BigInt(PERCENT_HUNDREDTHS_TOTAL));
  const contributorIndex = new Map(contributors.map((person, index) => [person.id, index]));

  return people.map((person) => {
    const amount = totals.get(person.id) ?? 0n;
    const index = contributorIndex.get(person.id);
    return {
      personId: person.id,
      role: person.role,
      amountPaise: Number(amount),
      percentHundredths: index === undefined ? 0 : Number(percentAlloc[index] ?? 0n),
    };
  });
}

export function collectedPaise(payments: SharePayment[]): number {
  return payments.reduce((sum, payment) => {
    assertNonNegativeSafeInteger(payment.amountPaise, "amountPaise");
    const next = sum + payment.amountPaise;
    if (!Number.isSafeInteger(next)) {
      throw new Error("collected paise overflow");
    }
    return next;
  }, 0);
}

export function targetProgress(collected: number): {
  remainingPaise: number;
  overPaise: number;
  percentHundredths: number;
} {
  assertNonNegativeSafeInteger(collected, "collected");
  const remainingPaise = collected >= TARGET_PAISE ? 0 : TARGET_PAISE - collected;
  const overPaise = collected > TARGET_PAISE ? collected - TARGET_PAISE : 0;
  const percentHundredths =
    collected === 0 ? 0 : Number((BigInt(collected) * 10_000n) / BigInt(TARGET_PAISE));
  return { remainingPaise, overPaise, percentHundredths };
}

export interface RoleChange {
  id: string;
  role: PersonRole;
}

export function planRoleChange(
  people: { id: string; role: PersonRole }[],
  personId: string,
  nextRole: PersonRole,
): RoleChange[] {
  const current = people.find((person) => person.id === personId);
  if (!current) {
    throw new Error("Unknown person");
  }
  const homeowner = people.find((person) => person.role === "homeowner");
  if (!homeowner) {
    throw new Error("Roster needs one homeowner");
  }
  if (nextRole === "contributor" && current.role === "homeowner") {
    throw new Error("Choose the next homeowner instead of clearing this one");
  }
  if (nextRole === "contributor") {
    return [{ id: personId, role: "contributor" }];
  }
  if (current.id === homeowner.id) {
    return [{ id: personId, role: "homeowner" }];
  }
  return [
    { id: homeowner.id, role: "contributor" },
    { id: personId, role: "homeowner" },
  ];
}

export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replaceAll("₹", "").replaceAll(/\s/g, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupeePart, fraction = ""] = cleaned.split(".");
  if (!rupeePart) return null;
  const rupees = Number(rupeePart);
  if (!Number.isSafeInteger(rupees)) return null;
  const paisePart = Number((fraction + "00").slice(0, 2));
  const paise = rupees * 100 + paisePart;
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_PAYMENT_PAISE) return null;
  return paise;
}

export function formatInrFromPaise(paise: number): string {
  assertNonNegativeSafeInteger(Math.abs(paise), "paise");
  if (!Number.isSafeInteger(paise)) {
    throw new Error("paise must be a safe integer");
  }
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees);
  if (remainder === 0) return `${sign}₹${formatted}`;
  return `${sign}₹${formatted}.${remainder.toString().padStart(2, "0")}`;
}

export function formatInrCompactFromPaise(paise: number): string {
  assertNonNegativeSafeInteger(paise, "paise");
  const rupees = Math.floor(paise / 100);
  if (rupees >= CRORE_RUPEES) return formatScaled(rupees, CRORE_RUPEES, "Cr");
  if (rupees >= LAKH_RUPEES) return formatScaled(rupees, LAKH_RUPEES, "L");
  return formatInrFromPaise(paise);
}

function formatScaled(rupees: number, unit: number, suffix: string): string {
  const hundredths = Math.floor((rupees * 100) / unit);
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  if (fraction === 0) return `₹${whole} ${suffix}`;
  const trimmed = fraction.toString().padStart(2, "0").replace(/0+$/, "");
  return `₹${whole}.${trimmed} ${suffix}`;
}

export function formatPercentHundredths(hundredths: number): string {
  assertNonNegativeSafeInteger(hundredths, "percent");
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  return `${whole}.${fraction.toString().padStart(2, "0")}%`;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLedgerDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
