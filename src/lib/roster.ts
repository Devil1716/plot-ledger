import type { PersonRole } from "@/lib/ledger-math";

export interface RosterPerson {
  id: string;
  name: string;
  role: PersonRole;
  color: string;
  sortOrder: number;
}

export const ROSTER: readonly RosterPerson[] = [
  { id: "ananya", name: "Ananya Iyer", role: "contributor", color: "#1f4d3a", sortOrder: 0 },
  { id: "rohan", name: "Rohan Mehta", role: "contributor", color: "#9a4a2a", sortOrder: 1 },
  { id: "kavita", name: "Kavita Shah", role: "contributor", color: "#c4a15a", sortOrder: 2 },
  { id: "arjun", name: "Arjun Nair", role: "contributor", color: "#3d5a80", sortOrder: 3 },
  { id: "meera", name: "Meera Krishnan", role: "contributor", color: "#6b4c7a", sortOrder: 4 },
  { id: "suresh", name: "Suresh Krishnan", role: "homeowner", color: "#8a8175", sortOrder: 5 },
];

export const DEMO_PROJECT_ID = "demo-plot-ledger";
export const DEMO_ADMIN_EMAIL = "admin@plotshare.local";
export const DEMO_MEMBER_EMAIL = "member@plotshare.local";
export const DEMO_ADMIN_PASSWORD = "plot-admin-2026";
export const DEMO_MEMBER_PASSWORD = "plot-member-2026";
export const DEMO_ADMIN_UID = "admin-user";
export const DEMO_MEMBER_UID = "member-user";
