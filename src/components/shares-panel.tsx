"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowDownAZ, ArrowDownWideNarrow, ChevronDown, IndianRupee, Percent, Ruler } from "lucide-react";
import { LandPlot } from "@/components/land-plot";
import { CountUp, itemVariants, listVariants } from "@/components/motion-bits";
import {
  formatInrCompactFromPaise,
  formatInrFromPaise,
  formatLedgerDate,
  formatPercentHundredths,
  formatSqftHundredths,
  LAND_SQFT,
} from "@/lib/ledger-math";
import type { ShareRow } from "@/lib/ledger-math";
import type { PaymentRecord, PersonRecord } from "@/lib/records";

type Sort = "share" | "paid" | "az";
type Metric = "pct" | "sqft" | "inr";
const SORTS: { id: Sort; label: string; icon: typeof ArrowDownAZ }[] = [
  { id: "share", label: "by share", icon: ArrowDownWideNarrow },
  { id: "paid", label: "by amount paid", icon: IndianRupee },
  { id: "az", label: "A to Z", icon: ArrowDownAZ },
];
const METRICS: { id: Metric; label: string; icon: typeof Percent }[] = [
  { id: "pct", label: "percent", icon: Percent },
  { id: "sqft", label: "square feet", icon: Ruler },
  { id: "inr", label: "rupees paid", icon: IndianRupee },
];
const SLATE = "#94A3B8";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SharesPanel({
  people,
  shares,
  payments,
  youId,
}: {
  people: PersonRecord[];
  shares: ShareRow[];
  payments: PaymentRecord[];
  youId: string | null;
}) {
  const [sort, setSort] = useState<Sort>("share");
  const [metric, setMetric] = useState<Metric>("pct");
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = people.map((person) => ({
      person,
      share: shares.find((item) => item.personId === person.id) ?? {
        personId: person.id,
        role: person.role,
        amountPaise: 0,
        percentHundredths: 0,
        sqftHundredths: 0,
      },
    }));
    const owner = list.filter((row) => row.person.role === "homeowner");
    const rest = list.filter((row) => row.person.role !== "homeowner");
    rest.sort((a, b) => {
      if (sort === "az") return a.person.name.localeCompare(b.person.name);
      if (sort === "paid") return b.share.amountPaise - a.share.amountPaise;
      return b.share.percentHundredths - a.share.percentHundredths || a.person.sortOrder - b.person.sortOrder;
    });
    return [...rest, ...owner];
  }, [people, shares, sort]);

  const sortInfo = SORTS.find((item) => item.id === sort)!;
  const metricInfo = METRICS.find((item) => item.id === metric)!;
  const SortIcon = sortInfo.icon;
  const MetricIcon = metricInfo.icon;
  const focus = selected ? rows.find((row) => row.person.id === selected) : null;

  return (
    <LayoutGroup>
      <div className="flex items-center justify-between">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => setSort(SORTS[(SORTS.indexOf(sortInfo) + 1) % SORTS.length].id)}
          aria-label={`Sort shares, currently ${sortInfo.label}`}
          data-testid="shares-sort"
          className="grid size-11 place-items-center rounded-full bg-white text-[#3c4558] shadow-sm ring-1 ring-[var(--border)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={sort} initial={{ rotate: -90, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0.4 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
              <SortIcon className="size-4" aria-hidden />
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <div className="text-center">
          <h1 className="text-lg font-semibold">Shares</h1>
          <p className="text-[11px] text-[var(--muted-foreground)]">Sorted {sortInfo.label}</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => setMetric(METRICS[(METRICS.indexOf(metricInfo) + 1) % METRICS.length].id)}
          aria-label={`Show shares as ${METRICS[(METRICS.indexOf(metricInfo) + 1) % METRICS.length].label}, currently ${metricInfo.label}`}
          data-testid="shares-metric"
          className="grid size-11 place-items-center rounded-full bg-white text-[#3c4558] shadow-sm ring-1 ring-[var(--border)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={metric} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
              <MetricIcon className="size-4" aria-hidden />
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      <Donut rows={rows} selected={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} focusName={focus?.person.name ?? null} focusPct={focus?.share.percentHundredths ?? null} />

      <motion.ul className="mt-5 grid gap-2.5" variants={listVariants} initial="hidden" animate="show">
        {rows.map(({ person, share }) => {
          const isOwner = person.role === "homeowner";
          const isYou = youId === person.id;
          const isOpen = expanded === person.id;
          const dim = selected !== null && selected !== person.id;
          const personPayments = payments
            .filter((payment) => payment.personId === person.id)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
          const value =
            metric === "pct"
              ? formatPercentHundredths(share.percentHundredths)
              : metric === "sqft"
                ? `${formatSqftHundredths(share.sqftHundredths)}`
                : formatInrCompactFromPaise(share.amountPaise);
          return (
            <motion.li
              key={person.id}
              layout
              variants={itemVariants}
              data-testid={`share-${person.id}`}
              data-dim={dim}
              onHoverStart={() => setSelected(person.id)}
              onHoverEnd={() => setSelected(null)}
              className={`overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_2px_rgb(15_21_36/0.05)] ring-1 ${isOpen ? "ring-[#c9ced8]" : "ring-[var(--border)]"}`}
              transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
            >
              <motion.button
                layout="position"
                type="button"
                aria-expanded={isOpen}
                aria-controls={`share-detail-${person.id}`}
                onClick={() => {
                  setExpanded(isOpen ? null : person.id);
                  setSelected(isOpen ? null : person.id);
                }}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center gap-3 px-3.5 pt-3 pb-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <span className="relative shrink-0">
                  <span
                    aria-hidden
                    className="grid size-11 place-items-center rounded-full text-sm font-semibold text-[#0b0f1a]"
                    style={{ background: isOwner ? "#e2e6ed" : person.color, color: isOwner ? "#475569" : undefined }}
                  >
                    {initialsOf(person.name)}
                  </span>
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-white"
                    style={{ background: isOwner ? SLATE : person.color, filter: isOwner ? undefined : "saturate(1.6) brightness(0.9)" }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{person.name}</span>
                    {isYou ? <span className="rounded-full bg-[#121829] px-2 py-0.5 text-[10px] font-semibold text-white">You</span> : null}
                    {isOwner ? (
                      <span className="rounded-full bg-[#eef0f4] px-2 py-0.5 text-[10px] font-medium text-[#475569] ring-1 ring-[#dde1e8]">
                        0% · owner, no share
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)] tabular-nums">
                    {formatInrFromPaise(share.amountPaise)} paid · {formatSqftHundredths(share.sqftHundredths)} sq ft
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={metric}
                      className={`text-right text-xl font-semibold tracking-tight tabular-nums ${isOwner ? "text-[#64748b]" : ""}`}
                      initial={{ y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -14, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    >
                      {metric === "pct" ? (
                        <CountUp value={share.percentHundredths} format={formatPercentHundredths} />
                      ) : (
                        value
                      )}
                      {metric === "sqft" ? <span className="ml-0.5 text-xs font-medium text-[var(--muted-foreground)]">ft²</span> : null}
                    </motion.span>
                  </AnimatePresence>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-[#94a3b8]">
                    <ChevronDown className="size-4" aria-hidden />
                  </motion.span>
                </span>
              </motion.button>
              <div className="px-3.5 pb-3" aria-hidden>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
                  <motion.div
                    className="h-full origin-left rounded-full"
                    style={{ background: isOwner ? SLATE : person.color, width: `${Math.max(share.percentHundredths / 100, 0)}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.5 }}
                  />
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    id={`share-detail-${person.id}`}
                    key="detail"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-4 border-t border-[var(--border)] bg-[#fafbfc] px-3.5 py-3.5"
                    data-testid={`share-detail-${person.id}`}
                  >
                    <div className="h-28 shrink-0">
                      <LandPlot people={people} shares={shares} highlightId={person.id} compact />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--muted-foreground)]">
                        {isOwner ? "Homeowner · payments recorded, no land share" : `${formatSqftHundredths(share.sqftHundredths)} sq ft of ${LAND_SQFT.toLocaleString("en-IN")}`}
                      </p>
                      {personPayments.length === 0 ? (
                        <p className="mt-2 text-sm text-[var(--muted-foreground)]">No payments yet.</p>
                      ) : (
                        <ol className="relative mt-2 space-y-2 border-l border-[#dde1e8] pl-3">
                          {personPayments.slice(0, 4).map((payment, index) => (
                            <motion.li
                              key={payment.id}
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.08 * index, type: "spring", stiffness: 300, damping: 24 }}
                              className="relative"
                            >
                              <span aria-hidden className="absolute top-1.5 -left-[16.5px] size-2 rounded-full ring-2 ring-[#fafbfc]" style={{ background: isOwner ? SLATE : person.color }} />
                              <p className="flex justify-between gap-2 text-sm">
                                <span className="font-medium tabular-nums text-[var(--mint-ink)]">+{formatInrFromPaise(payment.amountPaise)}</span>
                                <span className="text-xs text-[var(--muted-foreground)]">{formatLedgerDate(payment.date)}</span>
                              </p>
                              {payment.note ? <p className="truncate text-xs text-[var(--muted-foreground)]">{payment.note}</p> : null}
                            </motion.li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </motion.ul>
    </LayoutGroup>
  );
}

function Donut({
  rows,
  selected,
  onSelect,
  focusName,
  focusPct,
}: {
  rows: { person: PersonRecord; share: ShareRow }[];
  selected: string | null;
  onSelect: (id: string) => void;
  focusName: string | null;
  focusPct: number | null;
}) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = 2.2;
  const segments = rows.filter((row) => row.person.role === "contributor" && row.share.percentHundredths > 0);
  const arcs = segments.map((row, index) => {
    const before = segments.slice(0, index).reduce((sum, item) => sum + item.share.percentHundredths, 0);
    const len = (row.share.percentHundredths / 10_000) * C;
    return { row, start: (before / 10_000) * C, len: Math.max(len - GAP, 0.5) };
  });

  return (
    <div className="mt-4 flex flex-col items-center">
      <motion.svg
        viewBox="0 0 120 120"
        className="size-52"
        role="img"
        aria-label={`Ownership donut. ${segments.map((row) => `${row.person.name} ${formatPercentHundredths(row.share.percentHundredths)}`).join(", ") || "No contributor payments yet"}`}
        initial={{ rotate: -200, scale: 0.55, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.25 }}
      >
        <circle cx="60" cy="60" r={R} fill="none" stroke="#eef0f4" strokeWidth="10" />
        <g transform="rotate(-90 60 60)">
          {arcs.map(({ row, start: s, len }, index) => {
            const active = selected === row.person.id;
            const dim = selected !== null && !active;
            return (
              <motion.circle
                key={row.person.id}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={row.person.color}
                strokeLinecap="butt"
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={-s}
                initial={{ strokeWidth: 0, opacity: 0 }}
                animate={{ strokeWidth: active ? 14 : 10, opacity: dim ? 0.35 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: active || dim ? 0 : 0.4 + index * 0.08 }}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(row.person.id)}
              >
                <title>{`${row.person.name} ${formatPercentHundredths(row.share.percentHundredths)}`}</title>
              </motion.circle>
            );
          })}
        </g>
        <AnimatePresence mode="wait">
          <motion.g key={focusName ?? "total"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }} style={{ transformOrigin: "60px 60px" }}>
            <text x="60" y="57" textAnchor="middle" className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, fill: "#0f1524" }}>
              {focusName && focusPct !== null ? formatPercentHundredths(focusPct) : LAND_SQFT.toLocaleString("en-IN")}
            </text>
            <text x="60" y="71" textAnchor="middle" style={{ fontSize: 7, fill: "#5a6478" }}>
              {focusName ? focusName.split(" ")[0] : "sq ft in total"}
            </text>
          </motion.g>
        </AnimatePresence>
      </motion.svg>
      {segments.length === 0 ? (
        <p className="mt-1 text-center text-sm text-[var(--muted-foreground)]">No contributor payments yet, so every share is 0%.</p>
      ) : (
        <p className="mt-1 text-center text-xs text-[var(--muted-foreground)]">Tap a slice or a row to focus it</p>
      )}
    </div>
  );
}
