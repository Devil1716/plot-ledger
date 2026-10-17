import { describe, expect, it } from "vitest";
import { adminChangeError } from "@/lib/writes";

describe("adminChangeError", () => {
  it("allows adding and revoking while an existing admin stays", () => {
    expect(adminChangeError(["a"], ["a", "b"])).toBeNull();
    expect(adminChangeError(["a", "b"], ["a"])).toBeNull();
    expect(adminChangeError(["a", "b"], ["b"])).toBeNull();
  });
  it("never leaves zero admins, never swaps everyone out, caps at six", () => {
    expect(adminChangeError(["a"], [])).toMatch(/at least one admin/);
    expect(adminChangeError(["a"], ["b"])).toMatch(/current admin/);
    expect(adminChangeError(["a"], ["a", "b", "c", "d", "e", "f", "g"])).toMatch(/six/);
  });
});
