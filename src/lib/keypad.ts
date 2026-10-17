import { MAX_PAYMENT_PAISE } from "@/lib/ledger-math";

/** Keypad calculator for the add-payment flow. All money math is done in integer paise with BigInt. */
export type Operator = "+" | "-" | "×" | "÷";
export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back" | Operator;

export interface KeypadState {
  left: string;
  op: Operator | null;
  right: string;
}

export const EMPTY_KEYPAD: KeypadState = { left: "", op: null, right: "" };
/** ₹99,99,99,999 is the longest whole-rupee entry; anything above MAX_PAYMENT_PAISE is rejected on save. */
export const MAX_INT_DIGITS = 9;
export const MAX_DECIMALS = 2;

const OPERATORS: Operator[] = ["+", "-", "×", "÷"];

export function isOperator(key: string): key is Operator {
  return (OPERATORS as string[]).includes(key);
}

function appendToEntry(entry: string, key: string): string {
  if (key === ".") {
    if (entry.includes(".")) return entry;
    return entry === "" ? "0." : `${entry}.`;
  }
  const [whole, fraction] = entry.split(".");
  if (fraction !== undefined) {
    if (fraction.length >= MAX_DECIMALS) return entry;
    return `${entry}${key}`;
  }
  if (whole === "0") return key; // no leading zeros
  if (whole.length >= MAX_INT_DIGITS) return entry;
  return `${entry}${key}`;
}

/** Converts an entry like "1,43,000.5" (commas ignored) to paise. Returns null when empty or malformed. */
export function entryToPaise(entry: string): bigint | null {
  const clean = entry.replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

/** Rounds numerator/denominator half away from zero (both non-negative here). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export type EvalResult = { ok: true; paise: bigint } | { ok: false; reason: string };

export function evaluate(state: KeypadState): EvalResult {
  const left = entryToPaise(state.left);
  if (left === null) return { ok: false, reason: "Enter an amount" };
  if (!state.op || state.right === "") return { ok: true, paise: left };
  const right = entryToPaise(state.right);
  if (right === null) return { ok: false, reason: "Finish the second number" };
  switch (state.op) {
    case "+":
      return { ok: true, paise: left + right };
    case "-": {
      const value = left - right;
      return value < 0n ? { ok: false, reason: "That would be below zero" } : { ok: true, paise: value };
    }
    case "×":
      // right is a plain multiplier with up to 2 decimals: left × (right / 100)
      return { ok: true, paise: divRound(left * right, 100n) };
    case "÷":
      if (right === 0n) return { ok: false, reason: "Can't divide by zero" };
      return { ok: true, paise: divRound(left * 100n, right) };
  }
}

/** Checks a final amount against the save rules: more than zero and at most MAX_PAYMENT_PAISE. */
export function validatePaise(paise: bigint): string | null {
  if (paise <= 0n) return "Amount must be more than ₹0";
  if (paise > BigInt(MAX_PAYMENT_PAISE)) return "That's above the ₹10 crore limit for one payment";
  return null;
}

export function paiseToEntry(paise: bigint): string {
  const whole = paise / 100n;
  const fraction = paise % 100n;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export function press(state: KeypadState, key: Key): KeypadState {
  if (key === "back") {
    if (state.right) return { ...state, right: state.right.slice(0, -1) };
    if (state.op) return { ...state, op: null };
    return { ...state, left: state.left.slice(0, -1) };
  }
  if (isOperator(key)) {
    if (state.left === "") return state;
    if (state.op && state.right) {
      // chain: collapse the pending expression first when it is valid
      const result = evaluate(state);
      if (!result.ok || result.paise > BigInt(MAX_PAYMENT_PAISE) * 1000n) return state;
      return { left: paiseToEntry(result.paise), op: key, right: "" };
    }
    return { ...state, op: key };
  }
  if (state.op) return { ...state, right: appendToEntry(state.right, key) };
  return { ...state, left: appendToEntry(state.left, key) };
}

/** Collapses "a op b" into its result so it becomes the main amount. */
export function commit(state: KeypadState): KeypadState {
  const result = evaluate(state);
  if (!result.ok) return state;
  return { left: paiseToEntry(result.paise), op: null, right: "" };
}

/** Indian digit grouping for a raw entry, keeping a trailing "." or partial decimals while typing. */
export function formatEntry(entry: string): string {
  if (entry === "") return "0";
  const [whole, fraction] = entry.split(".");
  const digits = whole.replace(/^0+(?=\d)/, "");
  let grouped = digits;
  if (digits.length > 3) {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function formatPaiseShort(paise: bigint): string {
  return formatEntry(paiseToEntry(paise));
}
