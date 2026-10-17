"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useLedger } from "@/components/ledger-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LedgerGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, error, signOutUser } = useLedger();

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [router, status]);

  if (status === "loading" || status === "signed-out") {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <p className="font-heading text-2xl">Opening the ledger…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-6">
        <Alert variant="destructive">
          <AlertTitle>The ledger didn&apos;t open</AlertTitle>
          <AlertDescription>{error ?? "Check the emulators and try again."}</AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button variant="ghost" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
