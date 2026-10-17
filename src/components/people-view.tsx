"use client";

import { useState } from "react";
import { listVariants, motion, sideItemVariants } from "@/components/motion-bits";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { firebaseReady } from "@/lib/firebase";
import { formatPercentHundredths, type PersonRole } from "@/lib/ledger-math";
import type { PersonRecord } from "@/lib/records";
import { savePerson, updateAdmins } from "@/lib/writes";

export function PeopleView() {
  const ledger = useLedger();
  const [editing, setEditing] = useState<PersonRecord | null>(null);
  const [adminDraft, setAdminDraft] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ledger.dataReady) return <div className="bg-muted h-48 animate-pulse rounded-xl" />;

  async function saveAdmins() {
    if (!adminDraft || !ledger.profile || !ledger.accessCreatedAt) return;
    setBusy(true);
    try {
      const { db } = await firebaseReady();
      await updateAdmins(
        db,
        { uid: ledger.profile.uid, name: ledger.profile.displayName },
        ledger.accessCreatedAt,
        adminDraft,
      );
      toast.success("Admins updated");
      setAdminDraft(null);
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-heading text-3xl">People</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Five contributors and one homeowner. Accounts sign up on their own, then an admin links each login to a
          person. Linked people see the whole ledger and record only their own payments; the admin manages
          the roster and links, never payments for someone else.
        </p>
      </header>
      <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid gap-3">
        {ledger.people.map((person) => {
          const share = ledger.shares.find((item) => item.personId === person.id);
          return (
            <motion.li variants={sideItemVariants} key={person.id} className="bg-card flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
              <span className="size-3 rounded-full" style={{ background: person.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{person.name}</h2>
                  <Badge variant="outline">{person.role === "homeowner" ? "Homeowner" : "Contributor"}</Badge>
                  {ledger.profile?.personId === person.id ? <Badge>You</Badge> : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatPercentHundredths(share?.percentHundredths ?? 0)} ·{" "}
                  {person.linkedLabel ? `Linked to ${person.linkedLabel}` : "No login linked"}
                </p>
              </div>
              {ledger.isAdmin ? (
                <Button variant="outline" onClick={() => setEditing(person)}>
                  Edit
                </Button>
              ) : null}
            </motion.li>
          );
        })}
      </motion.ul>

      {ledger.isAdmin ? (
        <section className="bg-card rounded-xl p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-xl">Admins</h2>
          <p className="text-muted-foreground mt-1 mb-3 text-sm">
            Admins can record payments and edit people. You can&apos;t remove your own admin access from here.
          </p>
          <ul className="grid gap-2">
            {ledger.accounts.map((account) => {
              const selected = (adminDraft ?? ledger.adminUids).includes(account.uid);
              const self = account.uid === ledger.user?.uid;
              return (
                <li key={account.uid}>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected}
                      disabled={self}
                      onChange={(event) => {
                        const current = adminDraft ?? ledger.adminUids;
                        setAdminDraft(
                          event.target.checked
                            ? [...new Set([...current, account.uid])]
                            : current.filter((uid) => uid !== account.uid),
                        );
                      }}
                    />
                    <span>
                      {account.displayName}
                      <span className="text-muted-foreground"> · {account.email}</span>
                      {self ? " · you" : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {adminDraft ? (
            <Button className="mt-3" disabled={busy} onClick={() => void saveAdmins()}>
              {busy ? "Saving…" : "Save admins"}
            </Button>
          ) : null}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">You can read the roster. An admin links accounts and edits names.</p>
      )}

      <PersonDialog person={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PersonDialog({ person, onClose }: { person: PersonRecord | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(person)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {person ? <PersonForm key={person.id} person={person} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PersonForm({ person, onClose }: { person: PersonRecord; onClose: () => void }) {
  const { people, accounts, profile } = useLedger();
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<PersonRole>(person.role);
  const [linkedUid, setLinkedUid] = useState(person.linkedUid ?? "none");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const { db } = await firebaseReady();
      await savePerson(db, { uid: profile.uid, name: profile.displayName }, people, accounts, {
        personId: person.id,
        name,
        role,
        linkedUid: linkedUid === "none" ? null : linkedUid,
      });
      toast.success("Person updated");
      onClose();
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>Edit {person.name}</DialogTitle>
        <DialogDescription>
          Promoting someone to homeowner moves the previous homeowner to contributor, so the plot keeps one.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="person-name">Name</Label>
          <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} className="h-11" required />
        </div>
        <div className="grid gap-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(value) => value && setRole(value as PersonRole)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contributor">Contributor</SelectItem>
              <SelectItem value="homeowner">Homeowner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Linked account</Label>
          <Select value={linkedUid} onValueChange={(value) => setLinkedUid(value ?? "none")}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not linked</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.uid} value={account.uid}>
                  {account.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save person"}
        </Button>
      </DialogFooter>
    </form>
  );
}
