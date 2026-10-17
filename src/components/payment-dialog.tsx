"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { firebaseReady } from "@/lib/firebase";
import { formatInrFromPaise, formatIsoDate, parseIsoDate, parseRupeesToPaise } from "@/lib/ledger-math";
import type { PaymentRecord } from "@/lib/records";
import { createPayment, updatePayment } from "@/lib/writes";

export function PaymentDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: PaymentRecord | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <PaymentForm
            key={payment?.id ?? "new"}
            payment={payment ?? null}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ payment, onDone }: { payment: PaymentRecord | null; onDone: () => void }) {
  const { people, profile, myPersonId } = useLedger();
  // Payments are only ever recorded for the signed-in person (enforced by Firestore rules).
  const personId = payment?.personId ?? myPersonId ?? "";
  const personName = people.find((person) => person.id === personId)?.name ?? "You";
  const [amount, setAmount] = useState(payment ? formatInrFromPaise(payment.amountPaise) : "");
  const [date, setDate] = useState(payment ? formatIsoDate(payment.date) : new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(payment?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    const parsedDate = parseIsoDate(date);
    if (!personId) {
      setError("Ask the admin to link your account before recording payments.");
      return;
    }
    if (amountPaise === null) {
      setError("Enter a rupee amount with at most two decimal paise, greater than zero.");
      return;
    }
    if (!parsedDate) {
      setError("Choose a real date.");
      return;
    }
    if (!profile) {
      setError("Your profile is still loading.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { db } = await firebaseReady();
      const actor = { uid: profile.uid, name: profile.displayName };
      const input = { personId, amountPaise, date: parsedDate, note };
      if (payment) {
        await updatePayment(db, actor, people, payment.id, payment, input);
        toast.success("Payment updated");
      } else {
        await createPayment(db, actor, people, input);
        toast.success("Payment saved");
      }
      onDone();
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>{payment ? "Edit payment" : "Record a payment"}</DialogTitle>
        <DialogDescription>
          Amounts are stored in paise. Contributor share uses only contributor payments.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="payment-person">Paid by</Label>
          <p id="payment-person" data-testid="payment-person" className="flex h-11 items-center rounded-lg bg-muted px-3 text-sm font-medium">
            {personName} (you)
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-amount">Amount (INR)</Label>
          <Input
            id="payment-amount"
            data-testid="payment-amount"
            inputMode="decimal"
            placeholder="25,00,000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-date">Date</Label>
          <Input
            id="payment-date"
            data-testid="payment-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-note">Note</Label>
          <Textarea
            id="payment-note"
            data-testid="payment-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
            maxLength={500}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" data-testid="payment-save" disabled={saving}>
          {saving ? "Saving…" : "Save payment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
