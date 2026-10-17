import { describe, expect, it } from "vitest";
import {
  PERCENT_HUNDREDTHS_TOTAL,
  TARGET_PAISE,
  allocateLargestRemainder,
  collectedPaise,
  computeShares,
  formatInrCompactFromPaise,
  formatInrFromPaise,
  formatPercentHundredths,
  parseIsoDate,
  parseRupeesToPaise,
  planRoleChange,
  targetProgress,
  type SharePerson,
  type ShareRow,
} from "@/lib/ledger-math";

const LAKH = 100_000 * 100;

const roster: SharePerson[] = [
  { id: "ananya", role: "contributor" },
  { id: "rohan", role: "contributor" },
  { id: "kavita", role: "contributor" },
  { id: "arjun", role: "contributor" },
  { id: "meera", role: "contributor" },
  { id: "suresh", role: "homeowner" },
];

function byId(rows: ShareRow[], id: string): ShareRow {
  const row = rows.find((item) => item.personId === id);
  if (!row) throw new Error(`missing ${id}`);
  return row;
}

function contributorPercentSum(rows: ShareRow[]): number {
  return rows
    .filter((row) => row.role === "contributor")
    .reduce((sum, row) => sum + row.percentHundredths, 0);
}

describe("computeShares", () => {
  it("gives a 25L contributor 25% when contributors paid 1Cr and ignores the homeowner", () => {
    const rows = computeShares(roster, [
      { personId: "suresh", amountPaise: 20 * LAKH },
      { personId: "kavita", amountPaise: 25 * LAKH },
      { personId: "rohan", amountPaise: 75 * LAKH },
    ]);

    expect(byId(rows, "kavita").percentHundredths).toBe(2_500);
    expect(byId(rows, "rohan").percentHundredths).toBe(7_500);
    expect(byId(rows, "suresh").percentHundredths).toBe(0);
    expect(byId(rows, "suresh").amountPaise).toBe(20 * LAKH);
    expect(contributorPercentSum(rows)).toBe(PERCENT_HUNDREDTHS_TOTAL);
    expect(formatPercentHundredths(byId(rows, "kavita").percentHundredths)).toBe("25.00%");
  });

  it("splits the worked example across five contributors and keeps the total at 1.2 crore", () => {
    const payments = [
      { personId: "ananya", amountPaise: 30 * LAKH },
      { personId: "rohan", amountPaise: 20 * LAKH },
      { personId: "kavita", amountPaise: 25 * LAKH },
      { personId: "arjun", amountPaise: 15 * LAKH },
      { personId: "meera", amountPaise: 10 * LAKH },
      { personId: "suresh", amountPaise: 20 * LAKH },
    ];
    const rows = computeShares(roster, payments);

    expect(byId(rows, "ananya").percentHundredths).toBe(3_000);
    expect(byId(rows, "rohan").percentHundredths).toBe(2_000);
    expect(byId(rows, "kavita").percentHundredths).toBe(2_500);
    expect(byId(rows, "arjun").percentHundredths).toBe(1_500);
    expect(byId(rows, "meera").percentHundredths).toBe(1_000);
    expect(byId(rows, "suresh").percentHundredths).toBe(0);
    expect(contributorPercentSum(rows)).toBe(10_000);
    expect(collectedPaise(payments)).toBe(TARGET_PAISE);
  });

  it("returns zeros and does not divide when nobody has paid", () => {
    const rows = computeShares(roster, []);
    expect(rows.every((row) => row.percentHundredths === 0)).toBe(true);
    expect(rows.every((row) => row.amountPaise === 0)).toBe(true);
    expect(contributorPercentSum(rows)).toBe(0);
  });

  it("keeps every share at 0% when only the homeowner has paid", () => {
    const rows = computeShares(roster, [{ personId: "suresh", amountPaise: 50 * LAKH }]);
    expect(rows.every((row) => row.percentHundredths === 0)).toBe(true);
    expect(byId(rows, "suresh").amountPaise).toBe(50 * LAKH);
  });

  it("does not let a later homeowner payment change contributor percentages", () => {
    const before = computeShares(roster, [
      { personId: "kavita", amountPaise: 25 * LAKH },
      { personId: "rohan", amountPaise: 75 * LAKH },
    ]);
    const after = computeShares(roster, [
      { personId: "kavita", amountPaise: 25 * LAKH },
      { personId: "rohan", amountPaise: 75 * LAKH },
      { personId: "suresh", amountPaise: 90 * LAKH },
    ]);
    expect(byId(after, "kavita").percentHundredths).toBe(byId(before, "kavita").percentHundredths);
  });

  it("rounds one-third shares so the displayed percentages sum to 100", () => {
    const people: SharePerson[] = [
      { id: "a", role: "contributor" },
      { id: "b", role: "contributor" },
      { id: "c", role: "contributor" },
      { id: "h", role: "homeowner" },
    ];
    const rows = computeShares(people, [
      { personId: "a", amountPaise: 1 },
      { personId: "b", amountPaise: 1 },
      { personId: "c", amountPaise: 1 },
      { personId: "h", amountPaise: 9 },
    ]);
    expect(rows.filter((row) => row.role === "contributor").map((row) => row.percentHundredths)).toEqual([
      3_334, 3_333, 3_333,
    ]);
    expect(contributorPercentSum(rows)).toBe(PERCENT_HUNDREDTHS_TOTAL);
    expect(byId(rows, "h").percentHundredths).toBe(0);
  });

  it("gives unpaid contributors nothing while the payers share 100%", () => {
    const rows = computeShares(roster, [{ personId: "meera", amountPaise: 1 }]);
    expect(byId(rows, "meera").percentHundredths).toBe(PERCENT_HUNDREDTHS_TOTAL);
    expect(byId(rows, "ananya").percentHundredths).toBe(0);
    expect(contributorPercentSum(rows)).toBe(PERCENT_HUNDREDTHS_TOTAL);
  });

  it("splits 1 paise and 2 paise without floating point", () => {
    const people: SharePerson[] = [
      { id: "a", role: "contributor" },
      { id: "b", role: "contributor" },
    ];
    const rows = computeShares(people, [
      { personId: "a", amountPaise: 1 },
      { personId: "b", amountPaise: 2 },
    ]);
    expect(byId(rows, "a").percentHundredths + byId(rows, "b").percentHundredths).toBe(10_000);
    expect(byId(rows, "b").percentHundredths).toBeGreaterThan(byId(rows, "a").percentHundredths);
  });

  it("rejects fractional paise and unknown people", () => {
    expect(() => computeShares(roster, [{ personId: "kavita", amountPaise: 10.5 }])).toThrow(
      /integer/,
    );
    expect(() => computeShares(roster, [{ personId: "missing", amountPaise: 100 }])).toThrow(
      /Unknown person/,
    );
  });
});

describe("allocation", () => {
  it("breaks remainder ties toward the earlier person", () => {
    expect(allocateLargestRemainder([1n, 1n, 1n], 10_000n).map(Number)).toEqual([3334, 3333, 3333]);
  });


});

describe("money formatting", () => {
  it("formats crore, lakh, and paise in Indian grouping", () => {
    expect(formatInrFromPaise(TARGET_PAISE)).toBe("₹1,20,00,000");
    expect(formatInrFromPaise(25 * LAKH)).toBe("₹25,00,000");
    expect(formatInrFromPaise(1_050)).toBe("₹10.50");
    expect(formatInrCompactFromPaise(TARGET_PAISE)).toBe("₹1.2 Cr");
    expect(formatInrCompactFromPaise(25 * LAKH)).toBe("₹25 L");
    expect(formatPercentHundredths(2_500)).toBe("25.00%");
    expect(formatPercentHundredths(10_000)).toBe("100.00%");
  });

  it("parses Indian rupee input into integer paise", () => {
    expect(parseRupeesToPaise("25,00,000")).toBe(25 * LAKH);
    expect(parseRupeesToPaise("₹1,20,00,000")).toBe(TARGET_PAISE);
    expect(parseRupeesToPaise("10.5")).toBe(1_050);
    expect(parseRupeesToPaise("10.50")).toBe(1_050);
    expect(parseRupeesToPaise("10.555")).toBeNull();
    expect(parseRupeesToPaise("0")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("-5")).toBeNull();
  });

  it("tracks the gap to the 1.2 crore target in paise", () => {
    expect(targetProgress(0)).toEqual({
      remainingPaise: TARGET_PAISE,
      overPaise: 0,
      percentHundredths: 0,
    });
    expect(targetProgress(TARGET_PAISE)).toEqual({
      remainingPaise: 0,
      overPaise: 0,
      percentHundredths: 10_000,
    });
    expect(targetProgress(TARGET_PAISE + 100)).toMatchObject({
      remainingPaise: 0,
      overPaise: 100,
    });
  });

  it("rejects impossible calendar dates", () => {
    expect(parseIsoDate("2026-03-12")).toBeInstanceOf(Date);
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("12-03-2026")).toBeNull();
  });
});

describe("planRoleChange", () => {
  it("promotes a contributor and demotes the previous homeowner", () => {
    expect(planRoleChange(roster, "kavita", "homeowner")).toEqual([
      { id: "suresh", role: "contributor" },
      { id: "kavita", role: "homeowner" },
    ]);
  });

  it("refuses to leave the roster without a homeowner", () => {
    expect(() => planRoleChange(roster, "suresh", "contributor")).toThrow(/next homeowner/);
  });
});
