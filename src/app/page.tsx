"use client";

import { Dashboard } from "@/components/dashboard";
import { LedgerGate } from "@/components/ledger-gate";

export default function HomePage() {
  return (
    <LedgerGate>
      <Dashboard />
    </LedgerGate>
  );
}
