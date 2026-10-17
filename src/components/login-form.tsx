"use client";

import { MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { Button } from "@/components/ui/button";
import { usingEmulators } from "@/lib/firebase";
import { TEST_ACCOUNTS } from "@/lib/roster";

export function LoginForm() {
  const router = useRouter();
  const { status, signInGoogle, signInTestAccount } = useLedger();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emulators = usingEmulators();

  useEffect(() => {
    if (status === "ready") router.replace("/");
  }, [router, status]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (signInError) {
      setError(authErrorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "ready") {
    return (
      <div className="app-dark grid min-h-screen place-items-center text-white">
        <p className="font-heading text-2xl">Opening the ledger…</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-dark relative overflow-hidden">
      <div aria-hidden className="status-scrim" />
      <div
        aria-hidden
        className="login-glow pointer-events-none absolute -top-40 left-1/2 size-[36rem] rounded-full bg-[radial-gradient(circle,rgb(52_211_153/0.28),transparent_65%)]"
      />
    <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-8 px-4 pt-[calc(2.5rem+var(--safe-top))] pb-[calc(2.5rem+var(--safe-bottom))] md:grid-cols-2">
      <motion.section className="relative text-white" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 150, damping: 16 }}>
        <p className="flex items-center gap-3 text-xs tracking-[0.18em] text-white/65 uppercase">
          <Image src="/logo-mark.png" alt="" width={56} height={56} unoptimized priority className="size-14" />
          Plot Ledger
        </p>
        <h1 className="mt-2 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Who owns how much of the plot</h1>
        <p className="mt-4 max-w-md text-base text-white/70">
          The target is ₹1.20 crore. Contributor ownership follows what each contributor paid.
          The homeowner&apos;s money is recorded, and their share stays at zero.
        </p>
      </motion.section>
      <motion.div className="sheet relative grid gap-4 rounded-[2rem] p-6" initial={{ opacity: 0, y: 120, scale: 0.9, rotate: -2 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.15 }}>
        <div>
          <h2 className="font-heading text-2xl">Sign in</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Use your Google account. New members wait until the admin approves them.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-destructive rounded-lg bg-red-50 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <Button type="button" className="h-12 gap-3 text-base" disabled={busy} onClick={() => void run(signInGoogle)}>
          <GoogleMark />
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Your Google name and photo are shown to the other members of your group. You stay signed in on this
          device until you sign out.
        </p>
        {emulators ? (
          <div className="bg-secondary grid gap-2 rounded-xl p-3 text-xs leading-5" data-testid="emulator-accounts">
            <p className="font-medium">Emulator test accounts (local only)</p>
            {TEST_ACCOUNTS.map((account) => (
              <Button
                key={account.sub}
                type="button"
                variant="outline"
                className="h-10 justify-start"
                disabled={busy}
                onClick={() => void run(() => signInTestAccount(account))}
              >
                {account.label}
              </Button>
            ))}
          </div>
        ) : null}
      </motion.div>
    </div>
    </div>
    </MotionConfig>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5 rounded-full bg-white p-0.5">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
