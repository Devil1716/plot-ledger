"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { LandPlot } from "@/components/land-plot";
import { PaymentDialog } from "@/components/payment-dialog";
import { ShareCharts } from "@/components/share-charts";
import { useLedger } from "@/components/ledger-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  collectedPaise,
  formatInrCompactFromPaise,
  formatInrFromPaise,
  formatPercentHundredths,
  formatSqftHundredths,
  LAND_SQFT,
  targetProgress,
  TARGET_PAISE,
} from "@/lib/ledger-math";

export function Dashboard() {
  const { people, payments, shares, profile, isAdmin, dataReady } = useLedger();
  const [open, setOpen] = useState(false);
  const collected = collectedPaise(payments.map((payment) => ({ personId: payment.personId, amountPaise: payment.amountPaise })));
  const progress = targetProgress(collected);
  const contributorPool = shares
    .filter((share) => share.role === "contributor")
    .reduce((sum, share) => sum + share.amountPaise, 0);
  const homeownerPaid = shares
    .filter((share) => share.role === "homeowner")
    .reduce((sum, share) => sum + share.amountPaise, 0);
  const bar = Math.min(100, progress.percentHundredths / 100);

  if (!dataReady) {
    return (
      <div className="grid gap-3">
        <div className="bg-muted h-40 animate-pulse rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-muted h-36 animate-pulse rounded-xl" />
          <div className="bg-muted h-36 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <section className="bg-card rounded-xl p-6 ring-1 ring-foreground/10">
        <h1 className="font-heading text-2xl">The roster is empty</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          Start the Auth and Firestore emulators, then run <code>pnpm seed:demo</code>. The six people are
          seeded there; this app does not create a Firebase project for you.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="bg-card relative overflow-hidden rounded-2xl p-5 ring-1 ring-foreground/10">
          <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">Target pool</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-heading text-4xl leading-none sm:text-5xl" data-testid="collected-total">
                {formatInrFromPaise(collected)}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                of {formatInrFromPaise(TARGET_PAISE)} · {formatInrCompactFromPaise(TARGET_PAISE)}
              </p>
            </div>
            {isAdmin ? (
              <Button data-testid="add-payment" onClick={() => setOpen(true)} className="h-11">
                <Plus />
                Add payment
              </Button>
            ) : (
              <Badge variant="outline">Read only</Badge>
            )}
          </div>
          <div
            className="bg-muted mt-5 h-3 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={Math.round(bar)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward 1.2 crore"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{formatPercentHundredths(Math.min(progress.percentHundredths, 10000))} of target</span>
            {progress.overPaise > 0 ? (
              <span>{formatInrFromPaise(progress.overPaise)} over target</span>
            ) : (
              <span>{formatInrFromPaise(progress.remainingPaise)} still to raise</span>
            )}
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-secondary/70 px-3 py-3">
              <dt className="text-muted-foreground text-xs tracking-wide uppercase">Ownership pool</dt>
              <dd className="mt-1 text-lg font-medium" data-testid="ownership-pool">
                {formatInrFromPaise(contributorPool)}
              </dd>
              <p className="text-muted-foreground text-xs">Contributors only. This is the share denominator.</p>
            </div>
            <div className="rounded-xl bg-secondary/70 px-3 py-3">
              <dt className="text-muted-foreground text-xs tracking-wide uppercase">Homeowner recorded</dt>
              <dd className="mt-1 text-lg font-medium">{formatInrFromPaise(homeownerPaid)}</dd>
              <p className="text-muted-foreground text-xs">On the books and in the total. Ownership stays 0%.</p>
            </div>
          </dl>
        </div>
        <div className="bg-card rounded-2xl p-5 ring-1 ring-foreground/10">
          <h2 className="font-heading text-xl">Land split</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            {LAND_SQFT.toLocaleString("en-IN")} sq ft. Each band is that person&apos;s share of the depth.
          </p>
          <LandPlot people={people} shares={shares} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => {
          const row = shares.find((item) => item.personId === person.id);
          const isYou = profile?.personId === person.id;
          return (
            <article
              key={person.id}
              data-testid={`share-${person.id}`}
              className="bg-card rounded-2xl p-4 ring-1 ring-foreground/10"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: person.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading truncate text-lg leading-tight">{person.name}</h2>
                    {isYou ? <Badge>You</Badge> : null}
                    <Badge variant="outline">{person.role === "homeowner" ? "Homeowner" : "Contributor"}</Badge>
                  </div>
                  <p className="font-heading mt-3 text-3xl tabular-nums">
                    {formatPercentHundredths(row?.percentHundredths ?? 0)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatSqftHundredths(row?.sqftHundredths ?? 0)} sq ft · {formatInrFromPaise(row?.amountPaise ?? 0)} paid
                  </p>
                  {person.role === "homeowner" ? (
                    <p className="mt-2 text-xs">Payments stay visible. This share does not move.</p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <ShareCharts people={people} shares={shares} />

      <p className="text-muted-foreground max-w-3xl text-sm">
        A contributor&apos;s share is their payments divided by every contributor&apos;s payments. The homeowner is
        left out of that divisor. Percentages and square feet are rounded with the largest remainder so they add
        up to 100% and {LAND_SQFT.toLocaleString("en-IN")} sq ft whenever the contributor pool is above zero.
      </p>
      <PaymentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
