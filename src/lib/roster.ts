import type { PersonRole } from "@/lib/ledger-math";

export interface RosterPerson {
  id: string;
  name: string;
  role: PersonRole;
  color: string;
  sortOrder: number;
}

export const ROSTER: readonly RosterPerson[] = [
  { id: "ananya", name: "Ananya Iyer", role: "contributor", color: "#7AA7F5", sortOrder: 0 },
  { id: "rohan", name: "Rohan Mehta", role: "contributor", color: "#F29A85", sortOrder: 1 },
  { id: "kavita", name: "Kavita Shah", role: "contributor", color: "#EBC06C", sortOrder: 2 },
  { id: "arjun", name: "Arjun Nair", role: "contributor", color: "#A996F2", sortOrder: 3 },
  { id: "meera", name: "Meera Krishnan", role: "contributor", color: "#E38DB4", sortOrder: 4 },
  { id: "suresh", name: "Suresh Krishnan", role: "homeowner", color: "#94A3B8", sortOrder: 5 },
];

export const DEMO_PROJECT_ID = "demo-plot-ledger";
export const DEMO_ADMIN_EMAIL = "admin@plotshare.local";
export const DEMO_MEMBER_EMAIL = "member@plotshare.local";
export const DEMO_ADMIN_UID = "admin-user";
export const DEMO_MEMBER_UID = "member-user";

/** Emulator-only "Google" accounts (unsigned test tokens; see signInWithFakeGoogle). */
export const DEMO_ADMIN_GOOGLE_SUB = "demo-admin-google";
export const DEMO_MEMBER_GOOGLE_SUB = "demo-member-google";
export const TEST_ACCOUNTS = [
  { sub: DEMO_ADMIN_GOOGLE_SUB, email: DEMO_ADMIN_EMAIL, name: "Ananya Iyer", label: "Ananya (admin)" },
  { sub: DEMO_MEMBER_GOOGLE_SUB, email: DEMO_MEMBER_EMAIL, name: "Rohan Mehta", label: "Rohan (member)" },
  { sub: "demo-newcomer-google", email: "newcomer@plotshare.local", name: "Neha Newcomer", label: "Neha (new, not approved)" },
] as const;
