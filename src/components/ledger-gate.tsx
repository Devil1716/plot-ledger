"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LedgerGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, error, signOutUser, needsLink } = useLedger();

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
    return <WaitingForApproval />;
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

/** Signed in with Google, not approved yet. While no admin exists, offers the one-time claim. */
function WaitingForApproval() {
  const { profile, noAdminYet, claimAdmin, signOutUser } = useLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="app-dark grid min-h-screen place-items-center px-6 text-white" data-testid="needs-link">
      <div className="status-scrim" aria-hidden />
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Avatar name={profile?.displayName ?? "You"} photoURL={profile?.photoURL} className="size-20 text-xl ring-4 ring-white/10" />
        <div>
          <p className="text-sm text-white/60">{profile?.email}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Waiting for approval</h1>
        </div>
        <p className="text-base text-white/70">
          Hi {profile?.displayName?.split(" ")[0] ?? "there"}. Ask the admin to link your account to the group. The
          ledger opens here automatically once they approve you.
        </p>
        {noAdminYet ? (
          <div className="w-full rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10" data-testid="claim-admin">
            <p className="text-sm font-semibold">This group has no admin yet</p>
            <p className="mt-1 text-sm text-white/65">
              If you are setting up Plot Ledger, claim admin now. It works once: after that only admins can add admins.
            </p>
            <Button
              className="mt-3 h-11 w-full bg-[#34d399] text-[#0b0f1a] hover:bg-[#34d399]/90"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void claimAdmin()
                  .catch((claimError: unknown) => setError(authErrorMessage(claimError)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Claiming…" : "Claim admin (one-time)"}
            </Button>
            {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
          </div>
        ) : null}
        <Button variant="outline" className="h-11 px-6 text-[#0f1524]" onClick={() => void signOutUser()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
