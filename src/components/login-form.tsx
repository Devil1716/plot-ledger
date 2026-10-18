"use client";

import { MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { DotShape } from "@/components/brand/dot-shape";
import { markEntryPending } from "@/components/brand/entry-transition";
import { usingEmulators } from "@/lib/firebase";
import { TEST_ACCOUNTS } from "@/lib/roster";

const pill =
  "flex h-14 w-full items-center justify-center gap-3 rounded-full text-[15px] font-semibold transition-[transform,background-color] duration-150 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

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
    markEntryPending();
    // keeps the OTA updater from reloading the app while Google's picker is open
    document.documentElement.dataset.signingIn = "1";
    try {
      await action();
    } catch (signInError) {
      const message = authErrorMessage(signInError);
      // Android's account picker reports "[16] Cancelled by user" both when it is closed and
      // when it drops out on its own, so never fail silently: say it didn't finish.
      setError(
        /cancel|popup-closed|12501|\[16\]/i.test(message)
          ? "Sign-in didn't finish. Tap Continue with Google to try again."
          : message,
      );
    } finally {
      delete document.documentElement.dataset.signingIn;
      setBusy(false);
    }
  }

  const opening = status === "loading" || status === "ready";

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative flex min-h-dvh flex-col items-center bg-black px-6 pt-[calc(1.25rem+var(--safe-top))] pb-[calc(1.25rem+var(--safe-bottom))] text-white">
        <Image src="/logo-mark.png" alt="Plot Ledger" width={36} height={36} unoptimized priority className="size-9 rounded-full" />

        <div className="flex w-full flex-1 items-center justify-center">
          <DotShape size={260} className="max-h-[38vh]" />
        </div>

        <motion.div
          className="flex w-full max-w-sm flex-col items-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-[44px] leading-none font-semibold tracking-tight">Welcome</h1>
          <p className="mt-3 text-[15px] text-[#9a9a9a]">{opening ? "Opening your ledger…" : "Your plot, shared fairly"}</p>

          {error ? (
            <p role="alert" className="mt-5 w-full rounded-2xl bg-[#2a1214] px-4 py-3 text-center text-sm text-[#ffb4b4]">
              {error}
            </p>
          ) : null}

          <div className="mt-8 grid w-full gap-3">
            <button
              type="button"
              className={`${pill} bg-white text-black hover:bg-[#ececec]`}
              disabled={busy || opening}
              onClick={() => void run(signInGoogle)}
            >
              <GoogleMark />
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          </div>

          {emulators ? (
            <div className="mt-4 grid w-full gap-2" data-testid="emulator-accounts">
              <p className="text-center text-xs text-[#8a8a8a]">Emulator test accounts (local only)</p>
              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.sub}
                  type="button"
                  className={`${pill} h-12 bg-[#1a1a1a] text-sm font-medium text-white ring-1 ring-white/10`}
                  disabled={busy}
                  onClick={() => void run(() => signInTestAccount(account))}
                >
                  {account.label}
                </button>
              ))}
            </div>
          ) : null}

          <p className="mt-6 max-w-xs text-center text-[11px] leading-4 text-[#8a8a8a]">
            By continuing, your Google name and photo are shown to the members of your group. You stay signed in on
            this device until you sign out.
          </p>
        </motion.div>
      </main>
    </MotionConfig>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
