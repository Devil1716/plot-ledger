"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usingEmulators } from "@/lib/firebase";
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
  const emulators = usingEmulators();

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
    <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-8 px-4 py-10 md:grid-cols-2">
      <section>
        <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">Shared ground</p>
        <h1 className="font-heading mt-2 text-4xl leading-tight sm:text-5xl">Who owns how much of the plot</h1>
        <p className="text-muted-foreground mt-4 max-w-md text-base">
          The target is ₹1.20 crore for 5,670 sq ft. Contributor ownership follows what each contributor paid.
          The homeowner&apos;s money is recorded, and their share stays at zero.
        </p>
      </section>
      <form onSubmit={(event) => void onSubmit(event)} className="bg-card grid gap-4 rounded-2xl p-5 ring-1 ring-foreground/10">
        <div>
          <h2 className="font-heading text-2xl">{mode === "create" ? "Create an account" : "Sign in"}</h2>
          <p className="text-muted-foreground mt-1 text-sm">Your session stays on this browser.</p>
        </div>
        {mode === "create" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} className="h-11" required />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
            required
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" className="h-11" disabled={busy}>
          {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
        </Button>
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
        <button
          type="button"
          className="text-sm underline-offset-4 hover:underline"
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
      </form>
    </div>
  );
}
