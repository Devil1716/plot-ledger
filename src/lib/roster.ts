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
export const DEMO_ADMIN_PASSWORD = "plot-admin-2026";
export const DEMO_MEMBER_PASSWORD = "plot-member-2026";
export const DEMO_ADMIN_UID = "admin-user";
export const DEMO_MEMBER_UID = "member-user";
