import { describe, expect, it } from "vitest";
import { commit, EMPTY_KEYPAD, entryToPaise, evaluate, formatEntry, press, validatePaise, type Key, type KeypadState } from "@/lib/keypad";

function typeKeys(keys: Key[], start: KeypadState = EMPTY_KEYPAD) {
  return keys.reduce(press, start);
}
const digits = (s: string) => s.split("") as Key[];

describe("keypad calculator", () => {
  it("types an amount with Indian grouping", () => {
    const state = typeKeys(digits("143000"));
    expect(state.left).toBe("143000");
    expect(formatEntry(state.left)).toBe("1,43,000");
    expect(formatEntry("12000000")).toBe("1,20,00,000");
    expect(formatEntry("999")).toBe("999");
  });

  it("multiplies 1,43,000 × 2 into 2,86,000 and commits it", () => {
    const state = typeKeys([...digits("143000"), "×", "2"]);
    const result = evaluate(state);
    expect(result).toEqual({ ok: true, paise: 28_600_000n });
    const committed = commit(state);
    expect(committed).toEqual({ left: "286000", op: null, right: "" });
  });

  it("adds, subtracts and divides in exact paise", () => {
    expect(evaluate(typeKeys([...digits("100"), "+", ...digits("0.5")]))).toEqual({ ok: true, paise: 10_050n });
    expect(evaluate(typeKeys([...digits("100"), "-", ...digits("40")]))).toEqual({ ok: true, paise: 6_000n });
    // 100 ÷ 3 = 33.333… → 33.33
    expect(evaluate(typeKeys([...digits("100"), "÷", "3"]))).toEqual({ ok: true, paise: 3_333n });
    // 0.1 + 0.2 must be exactly 0.30
    expect(evaluate(typeKeys([...digits("0.1"), "+", ...digits("0.2")]))).toEqual({ ok: true, paise: 30n });
  });

  it("rounds half up on multiply and divide", () => {
    // 0.05 × 0.5 = 0.025 → 0.03
    expect(evaluate(typeKeys([...digits("0.05"), "×", ...digits("0.5")]))).toEqual({ ok: true, paise: 3n });
    // 1 ÷ 8 = 0.125 → 0.13
    expect(evaluate(typeKeys(["1", "÷", "8"]))).toEqual({ ok: true, paise: 13n });
  });

  it("refuses division by zero and negative results", () => {
    expect(evaluate(typeKeys([...digits("500"), "÷", "0"]))).toEqual({ ok: false, reason: "Can't divide by zero" });
    expect(evaluate(typeKeys([...digits("5"), "-", ...digits("9")])).ok).toBe(false);
    const state = typeKeys([...digits("500"), "÷", "0"]);
    expect(commit(state)).toBe(state);
  });

  it("caps digits, decimals and leading zeros", () => {
    expect(typeKeys(digits("12345678901")).left).toBe("123456789");
    expect(typeKeys(digits("1.239")).left).toBe("1.23");
    expect(typeKeys(digits("0007")).left).toBe("7");
    expect(typeKeys(["."]).left).toBe("0.");
    expect(typeKeys(digits("1..5")).left).toBe("1.5");
  });

  it("handles backspace across operator and operands", () => {
    let state = typeKeys([...digits("12"), "+", "3"]);
    state = press(state, "back");
    expect(state).toEqual({ left: "12", op: "+", right: "" });
    state = press(state, "back");
    expect(state).toEqual({ left: "12", op: null, right: "" });
    state = press(press(state, "back"), "back");
    expect(state).toEqual(EMPTY_KEYPAD);
    expect(press(EMPTY_KEYPAD, "back")).toEqual(EMPTY_KEYPAD);
  });

  it("ignores an operator with no amount and chains operators", () => {
    expect(press(EMPTY_KEYPAD, "×")).toEqual(EMPTY_KEYPAD);
    const state = typeKeys([...digits("10"), "+", "5", "×"]);
    expect(state).toEqual({ left: "15", op: "×", right: "" });
    expect(press(typeKeys(["5", "+"]), "-")).toEqual({ left: "5", op: "-", right: "" });
  });

  it("validates the final amount against zero and the per-payment cap", () => {
    expect(validatePaise(0n)).not.toBeNull();
    expect(validatePaise(1n)).toBeNull();
    expect(validatePaise(10_000_000_000n)).toBeNull();
    expect(validatePaise(10_000_000_001n)).not.toBeNull();
    // 99,99,99,999 × 99 stays exact with BigInt
    expect(evaluate(typeKeys([...digits("999999999"), "×", ...digits("99")]))).toEqual({ ok: true, paise: 9_899_999_990_100n });
  });

  it("parses entries", () => {
    expect(entryToPaise("1,43,000")).toBe(14_300_000n);
    expect(entryToPaise("2.5")).toBe(250n);
    expect(entryToPaise("")).toBeNull();
    expect(entryToPaise("1.234")).toBeNull();
  });
});
