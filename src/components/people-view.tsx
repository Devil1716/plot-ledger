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
import type { PersonRecord, UserRecord } from "@/lib/records";
import { approveAccount, savePerson, updateAdmins } from "@/lib/writes";
import { Avatar } from "@/components/avatar";
import { BUNDLE_NATIVE_BUILD, BUNDLE_VERSION } from "@/lib/app-update";

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
          Everyone signs in with Google and waits until the admin approves them. Approved members see the whole
          ledger and record only their own payments; the admin approves people, marks the homeowner (0% share)
          and never records money for someone else.
        </p>
      </header>
      {ledger.isAdmin ? <PendingApprovals /> : null}
      {ledger.people.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm" data-testid="roster-empty">
          Nobody is on the roster yet.{ledger.isAdmin ? " Approve yourself above to get started." : ""}
        </p>
      ) : null}
      <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid gap-3">
        {ledger.people.map((person) => {
          const share = ledger.shares.find((item) => item.personId === person.id);
          return (
            <motion.li variants={sideItemVariants} key={person.id} className="bg-card flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
              <Avatar name={person.name} photoURL={person.photoURL} color={person.color} className="size-10" />
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
            Admins approve new members and edit the roster. They can&apos;t record money for anyone else, and you
            can&apos;t remove your own admin access from here.
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
        <p className="text-muted-foreground text-sm">You can read the roster. The admin approves members and edits names.</p>
      )}

      <PersonDialog person={editing} onClose={() => setEditing(null)} />
      <p className="text-muted-foreground pt-2 text-center text-xs" data-testid="app-version">
        Plot Ledger v{BUNDLE_VERSION} · build {BUNDLE_NATIVE_BUILD}
      </p>
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
          <Select
            value={role}
            items={{ contributor: "Contributor", homeowner: "Homeowner" }}
            onValueChange={(value) => value && setRole(value as PersonRole)}
          >
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
          <Select
            value={linkedUid}
            items={{ none: "Not linked", ...Object.fromEntries(accounts.map((account) => [account.uid, account.displayName])) }}
            onValueChange={(value) => setLinkedUid(value ?? "none")}
          >
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

/** Admin: Google accounts waiting to join, with "add to roster" or "link to existing person". */
function PendingApprovals() {
  const { accounts, people, profile } = useLedger();
  const waiting = accounts.filter((account) => !account.personId);
  const free = people.filter((person) => !person.linkedUid);
  if (waiting.length === 0) return null;
  return (
    <section className="rounded-xl bg-[#ecfdf5] p-4 ring-1 ring-[#34d399]/40" data-testid="pending-approvals">
      <h2 className="font-heading text-xl">Waiting for approval</h2>
      <p className="text-muted-foreground mt-1 mb-3 text-sm">
        These Google accounts signed in but can&apos;t see the ledger yet.
      </p>
      <ul className="grid gap-3">
        {waiting.map((account) => (
          <PendingRow key={account.uid} account={account} free={free} self={account.uid === profile?.uid} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ account, free, self }: { account: UserRecord; free: PersonRecord[]; self: boolean }) {
  const { people, accounts, profile } = useLedger();
  const [role, setRole] = useState<PersonRole>("contributor");
  const [linkTo, setLinkTo] = useState<string>("new");
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (!profile) return;
    setBusy(true);
    try {
      const { db } = await firebaseReady();
      await approveAccount(
        db,
        { uid: profile.uid, name: profile.displayName },
        people,
        accounts,
        account,
        linkTo === "new" ? { mode: "new", role } : { mode: "link", personId: linkTo },
      );
      toast.success(`${account.displayName} approved`);
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-foreground/10" data-testid={`pending-${account.uid}`}>
      <Avatar name={account.displayName} photoURL={account.photoURL} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {account.displayName}
          {self ? " (you)" : ""}
        </p>
        <p className="text-muted-foreground truncate text-xs">{account.email}</p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {free.length > 0 ? (
          <Select
            value={linkTo}
            items={{ new: "New roster person", ...Object.fromEntries(free.map((person) => [person.id, `Link to ${person.name}`])) }}
            onValueChange={(value) => setLinkTo(value ?? "new")}
          >
            <SelectTrigger className="h-10 min-w-36" aria-label="Roster entry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New roster person</SelectItem>
              {free.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  Link to {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {linkTo === "new" ? (
          <Select
            value={role}
            items={{ contributor: "Contributor", homeowner: "Homeowner (0%)" }}
            onValueChange={(value) => value && setRole(value as PersonRole)}
          >
            <SelectTrigger className="h-10 min-w-32" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contributor">Contributor</SelectItem>
              <SelectItem value="homeowner">Homeowner (0%)</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Button className="h-10" disabled={busy} onClick={() => void approve()}>
          {busy ? "Approving…" : "Approve"}
        </Button>
      </div>
    </li>
  );
}
