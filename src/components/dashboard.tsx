"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenText, Plus } from "lucide-react";
import { LandPlot } from "@/components/land-plot";
import { PayFlow } from "@/components/pay-flow";
import { SharesPanel } from "@/components/shares-panel";
import { useLedger } from "@/components/ledger-provider";
import { CountUp, EASE_OUT, itemVariants, listVariants, motion, popVariants, tap } from "@/components/motion-bits";
import {
  collectedPaise,
  formatInrCompactFromPaise,
  formatInrFromPaise,
  formatLedgerDate,
  formatPercentHundredths,
  LAND_SQFT,
  targetProgress,
  TARGET_PAISE,
} from "@/lib/ledger-math";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "grid size-9 place-items-center rounded-full text-xs font-semibold text-[#0b0f1a] ring-2 ring-[#121829]"
          : "grid size-11 place-items-center rounded-full text-sm font-semibold text-[#0b0f1a]"
      }
      style={{ background: color }}
    >
      {initialsOf(name)}
    </span>
  );
}

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
  const collectedText = formatInrFromPaise(collected);
  const paisePart = collectedText.split(".")[1];
  const recent = [...payments].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  const contributors = people.filter((person) => person.role === "contributor");
  const homeowner = people.find((person) => person.role === "homeowner");

  if (!dataReady) {
    return (
      <div className="grid gap-3 px-5">
        <div className="h-40 animate-pulse rounded-3xl bg-white/10" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/10" />
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <section className="sheet mx-4 rounded-3xl p-6">
        <h1 className="font-heading text-2xl">The roster is empty</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          Start the Auth and Firestore emulators, then run <code>pnpm seed:demo</code>. The six people are
          seeded there; this app does not create a Firebase project for you.
        </p>
      </section>
    );
  }

  return (
    <>
    <motion.div
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start"
      animate={open ? { x: "-28%", scale: 0.94, opacity: 0.55 } : { x: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 210, damping: 26 }}
    >
      {/* Dark hero */}
      <section className="relative overflow-hidden px-5 pt-4 lg:sticky lg:top-4">
        <div aria-hidden className="pointer-events-none absolute top-4 -right-4 hidden h-32 w-12 sm:flex">
          {(shares.some((share) => share.percentHundredths > 0)
            ? shares.filter((share) => share.percentHundredths > 0)
            : contributors.map((person) => ({ personId: person.id, percentHundredths: 2000 }))
          ).map((share, index) => {
            const person = people.find((item) => item.id === share.personId);
            return (
              <motion.span
                key={share.personId}
                className="absolute inset-y-0 w-12 rounded-l-2xl shadow-lg shadow-black/40"
                style={{ background: person?.color ?? "#94A3B8", zIndex: 10 - index, right: index * 7, transformOrigin: "100% 100%" }}
                initial={{ x: 90, rotate: 28, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.25 + index * 0.1 }}
              />
            );
          })}
        </div>

        <p className="text-sm text-white/70">Collected</p>
        <p
          className="mt-1 flex items-baseline gap-1 pr-12 text-[2.4rem] leading-none font-semibold tracking-tight tabular-nums sm:text-5xl"
          data-testid="collected-total"
        >
          <motion.span
            className="inline-block origin-left"
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1, 1.1, 1] }}
            transition={{ duration: 1.75, times: [0, 0.8, 0.9, 1], ease: "easeOut" }}
          >
            <CountUp value={Math.floor(collected / 100) * 100} format={(v) => formatInrFromPaise(v)} duration={1.4} />
          </motion.span>
          <span className="text-2xl font-medium text-white/55">.{paisePart ?? "00"}</span>
        </p>
        <p className="mt-2 text-sm text-white/70">
          of {formatInrCompactFromPaise(TARGET_PAISE)} target ({formatInrFromPaise(TARGET_PAISE)})
        </p>

        <div
          className="mt-4 h-2 max-w-[calc(100%-4rem)] overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-valuenow={Math.round(bar)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress toward 1.2 crore"
        >
          <motion.div
            className="relative h-full origin-left overflow-hidden rounded-full bg-[var(--mint)]"
            style={{ width: `${bar}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.2 }}
          >
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              initial={{ x: "-120%" }}
              animate={{ x: "320%" }}
              transition={{ duration: 1.1, ease: "easeInOut", delay: 1.0, repeat: 2, repeatDelay: 1.6 }}
            />
          </motion.div>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-white/70">
          <span>{formatPercentHundredths(Math.min(progress.percentHundredths, 10000))} of target</span>
          {progress.overPaise > 0 ? (
            <span>{formatInrFromPaise(progress.overPaise)} over target</span>
          ) : (
            <span>{formatInrFromPaise(progress.remainingPaise)} still to raise</span>
          )}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {isAdmin ? (
            <motion.button
              {...tap}
              type="button"
              data-testid="add-payment"
              onClick={() => setOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full bg-white pr-4 pl-1.5 text-sm font-semibold text-[#0b0f1a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span className="grid size-7 place-items-center rounded-full bg-[var(--mint)] text-[#0b0f1a]">
                <Plus className="size-4" aria-hidden />
              </span>
              Add payment
            </motion.button>
          ) : (
            <span className="flex h-10 items-center rounded-full bg-white/10 px-4 text-sm font-medium ring-1 ring-white/15">
              Read only
            </span>
          )}
          <motion.div {...tap} className="rounded-full">
          <Link
            href="/history"
            className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium ring-1 ring-white/15 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
          >
            <BookOpenText className="size-4" aria-hidden />
            History
          </Link>
          </motion.div>
        </div>

        <div className="glass mt-6 flex items-center justify-between gap-3 rounded-3xl p-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">Ownership pool</p>
            <p className="text-xl font-semibold tabular-nums" data-testid="ownership-pool">
              {formatInrFromPaise(contributorPool)}
            </p>
            <p className="mt-1 text-xs text-white/60">Contributors only · share denominator</p>
          </div>
          <div className="flex shrink-0 items-center">
            <motion.ul
              className="flex -space-x-2"
              aria-label="Contributors"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.6 } } }}
            >
              {contributors.map((person) => (
                <motion.li key={person.id} title={person.name} variants={popVariants}>
                  <Avatar name={person.name} color={person.color} size="sm" />
                  <span className="sr-only">{person.name}</span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>
        {homeowner ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-white/70">
            <Avatar name={homeowner.name} color={homeowner.color} size="sm" />
            <span>
              {homeowner.name} (homeowner) paid {formatInrFromPaise(homeownerPaid)} · counted in the total, ownership
              stays 0%
            </span>
          </p>
        ) : null}
      </section>

      {/* White sheet */}
      <motion.section
        className="sheet min-w-0 rounded-t-[2rem] px-4 pt-3 pb-[calc(8rem+var(--safe-bottom))] sm:rounded-[2rem] sm:px-6 sm:pb-8"
        initial={{ y: "100vh" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 15, mass: 0.9, delay: 0.1 }}
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#d5d9e2]" />
        <SharesPanel people={people} shares={shares} payments={payments} youId={profile?.personId ?? null} />

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent payments</h2>
          <Link href="/history" className="text-sm font-medium text-[var(--foreground)] underline-offset-4 hover:underline">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] px-5 py-7 text-center" data-testid="payments-empty">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-[#34d399]/15 text-xl">₹</span>
            <p className="text-base font-medium">No payments yet</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Every share stays at 0% until {isAdmin ? "you record" : "an admin records"} the first payment.
            </p>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="h-12 rounded-full bg-[#0b0f1a] px-6 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                Record the first payment
              </button>
            ) : null}
          </div>
        ) : (
          <motion.ul className="mt-2 divide-y divide-[var(--border)]" data-testid="recent-payments" variants={listVariants} initial="hidden" animate="show">
            {recent.map((payment) => {
              const person = people.find((item) => item.id === payment.personId);
              return (
                <motion.li key={payment.id} variants={itemVariants} className="flex items-center gap-3 py-3">
                  <Avatar name={person?.name ?? "?"} color={person?.color ?? "#94A3B8"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{person?.name ?? "Unknown person"}</p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {formatLedgerDate(payment.date)}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--mint-ink)] tabular-nums">
                    +{formatInrFromPaise(payment.amountPaise)}
                  </p>
                </motion.li>
              );
            })}
          </motion.ul>
        )}

        <section className="mt-8 rounded-[1.5rem] bg-white p-4 shadow-[0_1px_2px_rgb(15_21_36/0.05)] ring-1 ring-[var(--border)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Land split</h2>
            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">54 × 105 ft · {LAND_SQFT.toLocaleString("en-IN")} sq ft</span>
          </div>
          <p className="mt-0.5 mb-4 text-sm text-[var(--muted-foreground)]">Each band is a contributor&apos;s share of the depth, front to back.</p>
          <LandPlot people={people} shares={shares} />
        </section>
        <div className="mt-4 flex gap-3 rounded-[1.25rem] bg-[#eef0f4] p-4 text-sm text-[#3c4558]">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#121829] ring-1 ring-[var(--border)]">i</span>
          <p>
            A contributor&apos;s share is their payments ÷ all contributors&apos; payments. The homeowner is left out of that
            divisor. Rounding uses largest remainder, so shares always total 100% and {LAND_SQFT.toLocaleString("en-IN")} sq ft.
          </p>
        </div>
      </motion.section>
    </motion.div>
    <PayFlow open={open} onClose={() => setOpen(false)} />
    </>
  );
}
