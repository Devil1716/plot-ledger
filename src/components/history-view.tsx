"use client";

import { useState } from "react";
import { listVariants, motion, sideItemVariants } from "@/components/motion-bits";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/payment-dialog";
import { authErrorMessage, useLedger } from "@/components/ledger-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firebaseReady } from "@/lib/firebase";
import { formatInrFromPaise, formatLedgerDate } from "@/lib/ledger-math";
import type { PaymentRecord } from "@/lib/records";
import { deletePayment } from "@/lib/writes";
import { canDeletePayment, canEditPayment, editTimeLeft } from "@/lib/permissions";

export function HistoryView() {
  const { payments, people, audit, profile, myPersonId, dataReady, isAdmin } = useLedger();
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [removing, setRemoving] = useState<PaymentRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const visible = payments.filter((payment) => filter === "all" || payment.personId === filter);

  async function confirmDelete() {
    if (!removing || !profile) return;
    setBusy(true);
    try {
      const { db } = await firebaseReady();
      await deletePayment(db, { uid: profile.uid, name: profile.displayName }, people, removing);
      toast.success("Payment removed");
      setRemoving(null);
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!dataReady) return <div className="bg-muted h-48 animate-pulse rounded-xl" />;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">Payment history</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            Every rupee is listed, including the homeowner. Whoever added an entry can fix it for 24 hours and remove it any time. Admins can add payments for members. Every change stays in the audit trail.
          </p>
        </div>
      </header>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Everyone
        </FilterChip>
        {people.map((person) => (
          <FilterChip key={person.id} active={filter === person.id} onClick={() => setFilter(person.id)}>
            {person.name.split(" ")[0]}
          </FilterChip>
        ))}
      </div>
      {visible.length === 0 ? (
        <section className="bg-card rounded-xl p-6 ring-1 ring-foreground/10">
          <h2 className="font-heading text-xl">No payments yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            When anyone records their own payment, it shows up here for everyone on the roster.
          </p>
        </section>
      ) : (
        <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid gap-3" data-testid="history-list">
          {visible.map((payment) => {
            const person = people.find((item) => item.id === payment.personId);
            // recorded by someone other than the member (an admin, on their behalf)
            const addedBy =
              person?.linkedUid && payment.createdBy !== person.linkedUid
                ? (people.find((item) => item.linkedUid === payment.createdBy)?.name ?? "an admin")
                : null;
            return (
              <motion.li variants={sideItemVariants} key={payment.id} data-testid={`payment-${payment.id}`} className="bg-card rounded-xl p-4 ring-1 ring-foreground/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: person?.color ?? "#94A3B8" }} />
                      <h2 className="font-medium">{person?.name ?? "Unknown person"}</h2>
                      {person?.role === "homeowner" ? <Badge variant="outline">Homeowner</Badge> : null}
                    </div>
                    <p className="font-heading mt-2 text-2xl">{formatInrFromPaise(payment.amountPaise)}</p>
                    <p className="text-muted-foreground text-sm">{formatLedgerDate(payment.date)}</p>
                    {addedBy ? (
                      <p className="text-muted-foreground mt-1 text-xs" data-testid="added-by">
                        Added by {addedBy}
                      </p>
                    ) : null}
                    {payment.note ? <p className="mt-2 text-sm">{payment.note}</p> : null}
                  </div>
                  {canDeletePayment(payment, profile?.uid, myPersonId, isAdmin) ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex gap-2">
                        {canEditPayment(payment, profile?.uid, myPersonId, now, isAdmin) ? (
                          <Button variant="outline" className="h-12 min-w-12 px-4" onClick={() => setEditing(payment)}>
                            Edit
                          </Button>
                        ) : null}
                        <Button variant="destructive" className="h-12 min-w-12 px-4" onClick={() => setRemoving(payment)}>
                          Delete
                        </Button>
                      </div>
                      {canEditPayment(payment, profile?.uid, myPersonId, now, isAdmin) ? (
                        <span className="text-muted-foreground text-xs">
                          Editable for {Math.max(1, Math.ceil(editTimeLeft(payment, now) / 3_600_000))}h more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <section>
        <h2 className="font-heading text-2xl">Audit trail</h2>
        <p className="text-muted-foreground mt-1 mb-3 text-sm">Who changed the ledger, and when.</p>
        {audit.length === 0 ? (
          <p className="text-muted-foreground text-sm">No changes recorded yet.</p>
        ) : (
          <ol className="grid gap-2" data-testid="audit-list">
            {audit.map((entry) => (
              <li key={entry.id} className="bg-card rounded-lg px-3 py-3 text-sm ring-1 ring-foreground/10">
                <p>{entry.summary}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {entry.actorName} · {formatLedgerDate(entry.at)} · {entry.action}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <PaymentDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} payment={editing} />
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this payment?</DialogTitle>
            <DialogDescription>
              {removing
                ? `${formatInrFromPaise(removing.amountPaise)} will leave the totals. The audit trail keeps a record of the deletion.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="destructive" className="h-12" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? "Deleting…" : "Delete payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 shrink-0 rounded-full px-3 text-sm ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
    >
      {children}
    </button>
  );
}
