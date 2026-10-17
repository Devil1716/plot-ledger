"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useLedger } from "@/components/ledger-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LedgerGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, error, signOutUser, needsLink, profile } = useLedger();

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [router, status]);

  if (status === "loading" || status === "signed-out") {
    return (
      <div className="app-dark grid min-h-screen place-items-center px-6 text-white" role="status" aria-live="polite">
        <div className="status-scrim" aria-hidden />
        <div className="flex flex-col items-center gap-4">
          <span aria-hidden className="size-10 animate-spin rounded-full border-[3px] border-white/15 border-t-[#34d399]" />
          <p className="text-base text-white/80">Opening the ledger…</p>
        </div>
      </div>
    );
  }

  if (needsLink) {
    return (
      <div className="app-dark grid min-h-screen place-items-center px-6 text-white" data-testid="needs-link">
        <div className="status-scrim" aria-hidden />
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <Image src="/logo-mark.png" alt="" width={72} height={72} unoptimized priority className="size-18" />
          <h1 className="text-2xl font-semibold tracking-tight">Ask the admin to link your account</h1>
          <p className="text-base text-white/70">
            You&apos;re signed in{profile?.email ? ` as ${profile.email}` : ""}, but your account isn&apos;t linked to a
            person on the roster yet. Once the admin links it, the ledger opens here automatically.
          </p>
          <Button variant="outline" className="h-11 px-6 text-[#0f1524]" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="app-dark grid min-h-screen place-items-center px-6">
        <div className="status-scrim" aria-hidden />
        <div className="w-full max-w-lg">
        <Alert variant="destructive">
          <AlertTitle>The ledger didn&apos;t open</AlertTitle>
          <AlertDescription>{error ?? "Check your connection and try again."}</AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="h-11 px-5" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button variant="ghost" className="h-11 px-5" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </Alert>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
