"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  easeInOut,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { ArrowLeft, ChevronDown, Delete } from "lucide-react";
import { NATIVE_BACK_EVENT } from "@/components/native-shell";
import { SlideToConfirm, type SlideStatus } from "@/components/slide-to-confirm";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { CountUp, EASE_OUT, seeded } from "@/components/motion-bits";
import { firebaseReady } from "@/lib/firebase";
import { haptic } from "@/lib/native";
import {
  collectedPaise,
  formatInrCompactFromPaise,
  formatInrFromPaise,
  parseIsoDate,
  TARGET_PAISE,
} from "@/lib/ledger-math";
import {
  commit,
  EMPTY_KEYPAD,
  evaluate,
  formatEntry,
  formatPaiseShort,
  isOperator,
  press,
  validatePaise,
  type Key,
  type KeypadState,
  type Operator,
} from "@/lib/keypad";
import type { PersonRecord } from "@/lib/records";
import { createPayment } from "@/lib/writes";

type Step = "pick" | "amount" | "success";
const MINT = "#34d399";
const INK = "#0f1524";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function PayFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>{open ? <PayFlowInner key="pay" onClose={onClose} /> : null}</AnimatePresence>,
    document.body,
  );
}

function PayFlowInner({ onClose }: { onClose: () => void }) {
  const { people, payments, shares, profile } = useLedger();
  const [step, setStep] = useState<Step>("pick");
  const [personId, setPersonId] = useState<string | null>(null);
  const [savedPaise, setSavedPaise] = useState<bigint>(0n);
  const person = people.find((item) => item.id === personId) ?? null;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Android back / Escape: amount sheet → who paid → close
  useEffect(() => {
    const goBack = (event: Event) => {
      event.preventDefault();
      if (step === "amount") setStep("pick");
      else onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") goBack(event);
    };
    window.addEventListener(NATIVE_BACK_EVENT, goBack);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(NATIVE_BACK_EVENT, goBack);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, step]);

  const paidBy = useCallback(
    (id: string) => shares.find((share) => share.personId === id)?.amountPaise ?? 0,
    [shares],
  );
  const remaining = Math.max(
    0,
    TARGET_PAISE - collectedPaise(payments.map((payment) => ({ personId: payment.personId, amountPaise: payment.amountPaise }))),
  );

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Add payment"
      className="app-dark fixed inset-0 z-50 overflow-clip text-white"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 210, damping: 27 }}
      data-testid="pay-flow"
    >
      <div className="mx-auto flex h-full max-w-md flex-col px-5 pt-[calc(1.25rem+var(--safe-top))]">
        <div className="flex items-center justify-between">
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onClose}
            aria-label="Back to ledger"
            className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 focus-visible:outline-2 focus-visible:outline-white"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </motion.button>
          <span className="text-xs text-white/60">{formatInrFromPaise(remaining)} left to raise</span>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Who paid?</h1>
        <p className="mt-1 text-sm text-white/65">Pick a person, then enter the amount.</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 overflow-y-auto pb-8">
          {people.map((item, index) => {
            const share = shares.find((row) => row.personId === item.id);
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 40, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.2 + index * 0.07 }}
              >
                <motion.button
                  whileTap={{ scale: 1.07 }}
                  whileHover={{ y: -4 }}
                  type="button"
                  data-testid={`pay-person-${item.id}`}
                  aria-label={`${item.name}, ${item.role === "homeowner" ? "homeowner" : "contributor"}`}
                  onClick={() => {
                    setPersonId(item.id);
                    setStep("amount");
                  }}
                  className="glass flex w-full flex-col items-center gap-2 rounded-3xl px-3 py-5 text-center focus-visible:outline-2 focus-visible:outline-white"
                >
                  {step === "amount" && personId === item.id ? (
                    <span aria-hidden className="size-16 rounded-full bg-white/5" />
                  ) : (
                    <motion.span
                      layoutId={`pay-avatar-${item.id}`}
                      aria-hidden
                      className="grid size-16 place-items-center rounded-full text-lg font-semibold text-[#0b0f1a]"
                      style={{ background: item.color }}
                      transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                      {initialsOf(item.name)}
                    </motion.span>
                  )}
                  <span className="text-sm font-semibold">{item.name}</span>
                  <span className="text-xs text-white/60">
                    {item.role === "homeowner"
                      ? "Homeowner · 0% share"
                      : `Contributor · ${formatInrCompactFromPaise(share?.amountPaise ?? 0)} paid`}
                  </span>
                </motion.button>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <AnimatePresence>
        {step === "amount" && person ? (
          <AmountSheet
            key="sheet"
            person={person}
            paidPaise={paidBy(person.id)}
            remainingPaise={remaining}
            onSwitchPerson={() => setStep("pick")}
            onSave={async (paise, date, note) => {
              if (!profile) throw new Error("Your profile is still loading.");
              const { db } = await firebaseReady();
              await createPayment(db, { uid: profile.uid, name: profile.displayName }, people, {
                personId: person.id,
                amountPaise: Number(paise),
                date,
                note,
              });
              setSavedPaise(paise);
            }}
            onSuccess={() => setStep("success")}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {step === "success" && person ? (
          <Success key="success" person={person} paise={savedPaise} onClose={onClose} />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

const KEYS: { key: Key; label: string }[] = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: ".", label: "." },
  { key: "0", label: "0" },
  { key: "back", label: "Delete" },
];
const OPS: { key: Operator; label: string }[] = [
  { key: "+", label: "Plus" },
  { key: "-", label: "Minus" },
  { key: "×", label: "Times" },
  { key: "÷", label: "Divide by" },
];

function AmountSheet({
  person,
  paidPaise,
  remainingPaise,
  onSwitchPerson,
  onSave,
  onSuccess,
}: {
  person: PersonRecord;
  paidPaise: number;
  remainingPaise: number;
  onSwitchPerson: () => void;
  onSave: (paise: bigint, date: Date, note: string) => Promise<void>;
  onSuccess: () => void;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<KeypadState>(EMPTY_KEYPAD);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [pop, setPop] = useState(0);
  const [committed, setCommitted] = useState(false);
  const [slide, setSlide] = useState<SlideStatus>("idle");
  const busy = useRef(false);
  const slideProgress = useMotionValue(0);
  const amountColor = useTransform(slideProgress, [0, 1], [INK, MINT], { ease: easeInOut });
  const avatarOpacity = useTransform(slideProgress, [0, 1], [1, 0.15]);

  const result = useMemo(() => evaluate(state), [state]);
  const pending = Boolean(state.op);
  const ready = !pending && result.ok && validatePaise(result.paise) === null;
  const readyPaise = ready && result.ok ? result.paise : 0n;
  const limitError = !pending && result.ok ? validatePaise(result.paise) : null;

  const tapKey = useCallback((key: Key) => {
    setError(null);
    setCommitted(false);
    setState((current) => press(current, key));
  }, []);

  const commitResult = useCallback(() => {
    setState((current) => commit(current));
    setCommitted(true);
    setPop((value) => value + 1);
  }, []);

  const confirm = useCallback(async () => {
    if (!ready || busy.current) return;
    const parsedDate = parseIsoDate(date);
    if (!parsedDate) {
      setError("Choose a real date.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setSlide("saving");
    setError(null);
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, reduce ? 0 : ms));
    try {
      // keep the spinner up long enough to read, even on a fast emulator
      await Promise.all([onSave(readyPaise, parsedDate, note), wait(900)]);
      setSlide("done");
      haptic("success");
      await wait(500);
      // grow the mint fill out of the slider thumb so the hand-off feels continuous
      const thumb = sectionRef.current?.querySelector<HTMLElement>("[data-testid=slide-thumb]")?.getBoundingClientRect();
      const box = sectionRef.current?.getBoundingClientRect();
      setBurst(
        thumb && box
          ? { x: thumb.left + thumb.width / 2 - box.left, y: thumb.top + thumb.height / 2 - box.top }
          : { x: (box?.width ?? 390) / 2, y: (box?.height ?? 800) / 2 },
      );
      await wait(560);
      onSuccess();
    } catch (saveError) {
      setBurst(null);
      setSlide("idle");
      animate(slideProgress, 0, { type: "spring", stiffness: 210, damping: 19 });
      setError(authErrorMessage(saveError));
      busy.current = false;
    } finally {
      setSaving(false);
    }
  }, [date, note, onSave, onSuccess, ready, readyPaise, reduce, slideProgress]);

  // physical keyboard support
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const map: Record<string, Key> = { "*": "×", x: "×", "/": "÷", Backspace: "back" };
      const key = (map[event.key] ?? event.key) as Key;
      if (/^[0-9.]$/.test(key) || isOperator(key) || key === "back") {
        event.preventDefault();
        tapKey(key);
      } else if (event.key === "Enter" || event.key === "=") {
        if (pending) commitResult();
        else void confirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitResult, confirm, pending, tapKey]);

  const leftText = formatEntry(state.left);
  const opText = state.op ? ` ${state.op} ${state.right ? formatEntry(state.right) : ""}` : "";
  const empty = state.left === "";

  return (
    <motion.section
      ref={sectionRef}
      aria-label={`Payment from ${person.name}`}
      className="absolute inset-x-0 -bottom-16 top-[calc(0.75rem+var(--safe-top))] flex flex-col rounded-t-[2rem] bg-[var(--background)] text-[var(--foreground)] shadow-[0_-12px_48px_rgb(3_6_14/0.5)]"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 190, damping: 19 }}
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-5 pt-3 pb-[calc(5rem+var(--safe-bottom))]">
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-[#d5d9e2]" />
        <div className="mt-3 flex justify-center">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-[var(--border)]">Payment</span>
        </div>
        <button
          type="button"
          onClick={onSwitchPerson}
          className="mx-auto mt-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          data-testid="pay-switch-person"
        >
          <motion.span
            layoutId={`pay-avatar-${person.id}`}
            aria-hidden
            className="grid size-6 place-items-center rounded-full text-[9px] font-semibold text-[#0b0f1a]"
            style={{ background: person.color }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {initialsOf(person.name)}
          </motion.span>
          {person.name.split(" ")[0]} · {formatInrFromPaise(paidPaise)} paid so far
          <ChevronDown className="size-3.5" aria-hidden />
        </button>

        {/* amount */}
        <div className="relative mt-4 flex flex-1 flex-col items-center justify-center select-none" data-testid="pay-swipe-area">
          <div className="flex items-center gap-3">
            <motion.p
              key={pop}
              aria-live="polite"
              data-testid="pay-amount"
              className="text-center leading-none font-semibold tracking-tight tabular-nums"
              style={{ color: empty ? "#c3c8d2" : amountColor }}
              initial={pop ? { scale: 0.45, y: 44, opacity: 0.3 } : false}
              animate={{ scale: pending ? 0.78 : 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 13 }}
            >
              <span className="inline-flex flex-nowrap items-baseline whitespace-nowrap text-[3.4rem]">
                ₹<Odometer text={leftText} />
                {opText ? <span className="inline-flex text-[#9aa2b1]"><Odometer text={opText} /></span> : null}
              </span>
            </motion.p>
            <AnimatePresence>
              {ready ? (
                <motion.span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-full text-xs font-semibold text-[#0b0f1a]"
                  style={{ background: person.color, opacity: avatarOpacity }}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 12 }}
                >
                  {initialsOf(person.name)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="mt-3 h-9">
            <AnimatePresence mode="wait">
              {pending && state.right && result.ok ? (
                <motion.button
                  key="result"
                  type="button"
                  data-testid="keypad-result"
                  aria-label={`Use result ${formatPaiseShort(result.paise)}`}
                  onClick={commitResult}
                  className="rounded-full px-3 py-1 text-lg text-[#6b7385] tabular-nums hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  initial={{ opacity: 0, y: -10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -60, scale: 1.8 }}
                  transition={{ type: "spring", stiffness: 320, damping: 18 }}
                >
                  = {formatPaiseShort(result.paise)}
                </motion.button>
              ) : pending && state.right && !result.ok ? (
                <motion.p key="err" role="alert" className="text-sm text-[var(--destructive)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {result.reason}
                </motion.p>
              ) : ready ? (
                <motion.p
                  key="ready"
                  className="text-sm text-[#6b7385]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Paying {person.name.split(" ")[0]}
                </motion.p>
              ) : (
                <motion.p key="remain" className="text-sm text-[#6b7385]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {limitError ?? `Remaining to target ${formatInrFromPaise(remainingPaise)}`}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {error ? (
            <p role="alert" className="mt-1 text-sm text-[var(--destructive)]">
              {error}
            </p>
          ) : null}
        </div>

        {/* date + note */}
        <div className="mb-3 flex gap-2">
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-[var(--border)]">
            <span className="text-[var(--muted-foreground)]">Date</span>
            <input
              type="date"
              aria-label="Date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-transparent text-xs outline-none"
            />
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-[var(--border)]">
            <span className="text-[var(--muted-foreground)]">Note</span>
            <input
              aria-label="Note"
              value={note}
              maxLength={500}
              placeholder="Optional"
              onChange={(event) => setNote(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
        </div>

        {/* slide to confirm (springs up once an amount is ready) */}
        <div className="relative mb-3 h-16">
          <AnimatePresence initial={false}>
            {ready || slide !== "idle" ? (
              <motion.div
                key="slider"
                className="absolute inset-0"
                initial={{ y: 40, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 340, damping: 18 }}
              >
                <SlideToConfirm
                  label={`slide to pay ₹${formatPaiseShort(readyPaise)}`}
                  status={slide}
                  disabled={saving && slide === "idle"}
                  progress={slideProgress}
                  onConfirm={() => void confirm()}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {ready ? (
            <button
              type="button"
              data-testid="payment-confirm"
              onClick={() => void confirm()}
              disabled={saving}
              className="sr-only"
            >
              {`Confirm ₹${formatPaiseShort(readyPaise)} for ${person.name}`}
            </button>
          ) : null}
        </div>

        {/* operators: fade out once a calculated result has been taken */}
        <motion.div
          className="mb-2 grid h-11 grid-cols-4"
          animate={{ opacity: committed && ready ? 0 : 1, height: committed && ready ? 0 : 44 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          aria-hidden={committed && ready}
        >
          {OPS.map((op) => (
            <motion.button
              key={op.key}
              type="button"
              aria-label={op.label}
              tabIndex={committed && ready ? -1 : 0}
              data-testid={`key-op-${op.label.split(" ")[0].toLowerCase()}`}
              whileTap={{ scale: 0.85 }}
              onClick={() => tapKey(op.key)}
              className={`text-2xl ${state.op === op.key ? "text-[#0f1524]" : "text-[#6b7385]"} focus-visible:outline-2 focus-visible:outline-[var(--ring)]`}
            >
              {op.key === "-" ? "−" : op.key}
            </motion.button>
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Keypad">
          {KEYS.map((item) => (
            <KeypadKey key={item.key} item={item} onPress={tapKey} />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {burst ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-20 size-[52px] rounded-full"
            style={{ background: MINT, left: burst.x - 26, top: burst.y - 26, willChange: "transform" }}
            initial={{ scale: 1 }}
            animate={{ scale: 44 }}
            transition={{ duration: reduce ? 0 : 0.56, ease: [0.65, 0, 0.35, 1] }}
          />
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function Success({ person, paise, onClose }: { person: PersonRecord; paise: bigint; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <motion.button
      ref={closeRef}
      type="button"
      data-testid="payment-done"
      onClick={onClose}
      aria-label={`Payment of ₹${formatPaiseShort(paise)} recorded for ${person.name}. Close`}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center text-[#052e1c] outline-none"
      style={{ background: MINT }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Confetti />
      <motion.svg
        viewBox="0 0 52 52"
        className="size-24"
        aria-hidden
        initial={{ scale: 0.3 }}
        animate={{ scale: [0.3, 1, 1, 1.22, 1] }}
        transition={{ duration: 1.3, times: [0, 0.25, 0.6, 0.75, 1], ease: "easeOut" }}
      >
        <motion.circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="#052e1c"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
        />
        <motion.path
          d="M15 27 l7 7 l15 -16"
          fill="none"
          stroke="#052e1c"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.4 }}
        />
      </motion.svg>
      <motion.span
        className="mt-6 text-5xl font-semibold tracking-tight tabular-nums"
        initial={{ scale: 0.5, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 13, delay: 0.2 }}
      >
        ₹<CountUp value={Number(paise)} format={(v) => formatPaiseShort(BigInt(v))} duration={1.1} />
      </motion.span>
      <span className="mt-2 text-base font-medium">Recorded for {person.name}</span>
      <span className="absolute bottom-[calc(2rem+var(--safe-bottom))] text-sm opacity-80">Tap anywhere to close</span>
    </motion.button>
  );
}


/** Each character slides up as it appears, like an odometer. */
function Odometer({ text }: { text: string }) {
  return (
    <span className="inline-flex overflow-hidden align-bottom">
      <AnimatePresence initial={false} mode="popLayout">
        {text.split("").map((char, index) => (
          <motion.span
            key={`${index}-${char}`}
            className="inline-block whitespace-pre"
            initial={{ y: "70%", opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "-70%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 22 }}
          >
            {char}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

function KeypadKey({ item, onPress }: { item: { key: Key; label: string }; onPress: (key: Key) => void }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const nextId = useRef(0);
  return (
    <motion.button
      type="button"
      aria-label={item.label}
      data-testid={item.key === "back" ? "key-back" : item.key === "." ? "key-dot" : `key-${item.key}`}
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 600, damping: 15 }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const id = nextId.current++;
        setRipples((list) => [...list, { id, x: event.clientX - rect.left, y: event.clientY - rect.top }]);
      }}
      onClick={() => {
        haptic("key");
        onPress(item.key);
      }}
      className="relative grid h-14 place-items-center overflow-hidden rounded-[1.1rem] bg-[#eff1f5] text-2xl font-medium text-[#0f1524] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
    >
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          aria-hidden
          className="pointer-events-none absolute size-10 rounded-full bg-[#34d399]/45"
          style={{ left: ripple.x - 20, top: ripple.y - 20 }}
          initial={{ scale: 0, opacity: 0.9 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onAnimationComplete={() => setRipples((list) => list.filter((item2) => item2.id !== ripple.id))}
        />
      ))}
      <span className="relative">{item.key === "back" ? <Delete className="size-6" aria-hidden /> : item.label}</span>
    </motion.button>
  );
}

const CONFETTI_COLORS = ["#7AA7F5", "#F29A85", "#EBC06C", "#A996F2", "#E38DB4", "#ffffff", "#0b0f1a"];

/** Lightweight confetti: 42 transform/opacity-only particles bursting from the check mark. */
function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute top-[42%] left-1/2">
      {Array.from({ length: 42 }, (_, index) => {
        const angle = seeded(index) * Math.PI * 2;
        const distance = 140 + seeded(index + 100) * 220;
        const size = 6 + Math.round(seeded(index + 200) * 8);
        return (
          <motion.span
            key={index}
            className="absolute block rounded-[2px]"
            style={{
              willChange: "transform, opacity",
              width: size,
              height: size * (index % 3 === 0 ? 2.2 : 1),
              background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.4 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: [0, Math.sin(angle) * distance - 60, Math.sin(angle) * distance + 160],
              rotate: (seeded(index + 300) - 0.5) * 720,
              opacity: [1, 1, 0],
              scale: 1,
            }}
            transition={{ duration: 1.6 + seeded(index + 400) * 0.6, ease: "easeOut", delay: 0.15 }}
          />
        );
      })}
    </span>
  );
}
