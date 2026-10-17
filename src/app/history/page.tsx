"use client";

import { HistoryView } from "@/components/history-view";
import { LedgerGate } from "@/components/ledger-gate";

export default function HistoryPage() {
  return (
    <LedgerGate>
      <HistoryView />
    </LedgerGate>
  );
}
