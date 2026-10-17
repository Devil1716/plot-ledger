"use client";

import { LedgerGate } from "@/components/ledger-gate";
import { PeopleView } from "@/components/people-view";

export default function PeoplePage() {
  return (
    <LedgerGate>
      <PeopleView />
    </LedgerGate>
  );
}
