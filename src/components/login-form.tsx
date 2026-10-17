"use client";

import { MotionConfig, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usingEmulators } from "@/lib/firebase";
import { isNativeApp } from "@/lib/native";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD } from "@/lib/roster";

export function LoginForm() {
  const router = useRouter();
  const { status, signInEmail, signUpEmail, signInGoogle } = useLedger();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emulators = usingEmulators();
  // Google popup sign-in can't run inside the iOS/Android WebView, and a real
  // project only offers it once the provider is enabled (NEXT_PUBLIC_GOOGLE_SIGN_IN).
  const native = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
  const showGoogle = !native && process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN !== "false";

  useEffect(() => {
    if (status === "ready") router.replace("/");
  }, [router, status]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") await signUpEmail(email, password, name);
      else await signInEmail(email, password);
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "ready") {
    return (
      <div className="grid min-h-screen place-items-center">
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
        <p className="text-xs tracking-[0.18em] text-white/65 uppercase">Plot Ledger</p>
        <h1 className="mt-2 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Who owns how much of the plot</h1>
        <p className="mt-4 max-w-md text-base text-white/70">
          The target is ₹1.20 crore for 5,670 sq ft. Contributor ownership follows what each contributor paid.
          The homeowner&apos;s money is recorded, and their share stays at zero.
        </p>
      </motion.section>
      <motion.form onSubmit={(event) => void onSubmit(event)} className="sheet relative grid gap-4 rounded-[2rem] p-6" initial={{ opacity: 0, y: 120, scale: 0.9, rotate: -2 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.15 }}>
        <div>
          <h2 className="font-heading text-2xl">{mode === "create" ? "Create an account" : "Sign in"}</h2>
          <p className="text-muted-foreground mt-1 text-sm">You stay signed in on this device until you sign out.</p>
        </div>
        {mode === "create" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} className="h-12 text-base" autoComplete="name" enterKeyHint="next" required />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 text-base"
            required
          />
        </div>
        <div className="relative grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            enterKeyHint="go"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 pr-16 text-base"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-controls="password"
            title={showPassword ? "Hide what you typed" : "Show what you typed"}
            className="absolute right-1 bottom-1 h-10 rounded-lg px-3 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-destructive rounded-lg bg-red-50 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-12 text-base" disabled={busy}>
          {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
        </Button>
        {showGoogle ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              setError(null);
              void signInGoogle().catch((googleError: unknown) => setError(authErrorMessage(googleError)));
            }}
          >
            Continue with Google
          </Button>
        ) : null}
        <button
          type="button"
          className="min-h-11 text-sm underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setError(null);
          }}
        >
          {mode === "create" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        {emulators ? (
          <div className="bg-secondary rounded-xl p-3 text-xs leading-5">
            <p className="font-medium">Emulator accounts</p>
            <p>
              Admin {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}
            </p>
            <p>
              Member {DEMO_MEMBER_EMAIL} / {DEMO_MEMBER_PASSWORD}
            </p>
          </div>
        ) : null}
      </motion.form>
    </div>
    </div>
    </MotionConfig>
  );
}

function noopSubscribe() {
  return () => {};
}
