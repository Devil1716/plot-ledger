"use client";

import { LedgerGate } from "@/components/ledger-gate";

export default function LedgerLayout({ children }: { children: React.ReactNode }) {
  return <LedgerGate>{children}</LedgerGate>;
}
