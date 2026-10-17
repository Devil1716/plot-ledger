"use client";

import { useEffect, useState } from "react";
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
  const [adminChange, setAdminChange] = useState<{ account: UserRecord; grant: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ledger.dataReady) return <div className="bg-muted h-48 animate-pulse rounded-xl" />;

  async function applyAdminChange() {
    if (!adminChange || !ledger.profile || !ledger.accessCreatedAt) return;
    const { account, grant } = adminChange;
    const next = grant
      ? [...new Set([...ledger.adminUids, account.uid])]
      : ledger.adminUids.filter((uid) => uid !== account.uid);
    setBusy(true);
    try {
      const { db } = await firebaseReady();
      await updateAdmins(
        db,
        { uid: ledger.profile.uid, name: ledger.profile.displayName },
        ledger.accessCreatedAt,
        ledger.adminUids,
        next,
        { name: account.displayName || account.email, granted: grant },
      );
      toast.success(grant ? `${account.displayName} is now an admin` : `${account.displayName} is no longer an admin`);
      setAdminChange(null);
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const approvedAccounts = ledger.accounts.filter((account) => account.personId || ledger.adminUids.includes(account.uid));
  const lastAdmin = ledger.adminUids.length <= 1;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-heading text-3xl">People</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Everyone signs in with Google and waits until an admin approves them. Approved members see the whole
          ledger and record or delete only their own payments; admins approve people, mark the homeowner (0% share)
          and never record money for someone else.
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
                <Button variant="outline" className="h-12 min-w-12 px-4" onClick={() => setEditing(person)}>
                  Edit
                </Button>
              ) : null}
            </motion.li>
          );
        })}
      </motion.ul>

      {ledger.isAdmin ? (
        <section className="bg-card rounded-xl p-4 ring-1 ring-foreground/10" data-testid="admins-section">
          <h2 className="font-heading text-xl">Admins</h2>
          <p className="text-muted-foreground mt-1 mb-3 text-sm">
            Admins approve new members and edit the roster. They can&apos;t record or delete money for anyone else.
            There is always at least one admin.
          </p>
          {approvedAccounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Approve someone first, then you can make them an admin.</p>
          ) : (
            <ul className="grid gap-2">
              {approvedAccounts.map((account) => {
                const isAdmin = ledger.adminUids.includes(account.uid);
                const self = account.uid === ledger.user?.uid;
                const locked = isAdmin && lastAdmin;
                return (
                  <li key={account.uid} className="flex flex-wrap items-center gap-3" data-testid={`admin-row-${account.uid}`}>
                    <Avatar name={account.displayName} photoURL={account.photoURL} color="#7AA7F5" className="size-9" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">
                        {account.displayName}
                        {self ? " (you)" : ""}
                      </p>
                      <p className="text-muted-foreground truncate">{account.email}</p>
                    </div>
                    {isAdmin ? <Badge>Admin</Badge> : null}
                    <Button
                      variant={isAdmin ? "outline" : "secondary"}
                      className="h-12 min-w-12 px-4"
                      disabled={busy || locked || (!isAdmin && ledger.adminUids.length >= 6)}
                      title={locked ? "The last admin can't be removed" : undefined}
                      onClick={() => setAdminChange({ account, grant: !isAdmin })}
                    >
                      {isAdmin ? (self ? "Step down" : "Remove admin") : "Make admin"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {lastAdmin ? (
            <p className="text-muted-foreground mt-3 text-xs">You&apos;re the only admin, so you can&apos;t step down until someone else is one.</p>
          ) : null}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">You can read the roster. Admins approve members and edit names.</p>
      )}

      <Dialog open={Boolean(adminChange)} onOpenChange={(open) => !open && setAdminChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adminChange?.grant
                ? `Make ${adminChange.account.displayName} an admin?`
                : adminChange?.account.uid === ledger.user?.uid
                  ? "Step down as admin?"
                  : `Remove ${adminChange?.account.displayName ?? ""} as admin?`}
            </DialogTitle>
            <DialogDescription>
              {adminChange?.grant
                ? "They'll be able to approve members, edit the roster and manage admins. The change is recorded in the audit trail."
                : adminChange?.account.uid === ledger.user?.uid
                  ? "You'll lose admin access right away; another admin has to give it back. Recorded in the audit trail."
                  : "They keep their account and payments but lose admin access. Recorded in the audit trail."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setAdminChange(null)}>
              Cancel
            </Button>
            <Button
              variant={adminChange?.grant ? "default" : "destructive"}
              className="h-12"
              disabled={busy}
              onClick={() => void applyAdminChange()}
              data-testid="confirm-admin-change"
            >
              {busy ? "Saving…" : adminChange?.grant ? "Make admin" : "Remove admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PersonDialog person={editing} onClose={() => setEditing(null)} />
      <p className="text-muted-foreground pt-2 text-center text-xs" data-testid="app-version">
        Plot Ledger v{BUNDLE_VERSION} · build {BUNDLE_NATIVE_BUILD}
      </p>
      <UpdateStatus />
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

function UpdateStatus() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("plotledger:update-status");
      if (!raw) return;
      const { at, result } = JSON.parse(raw) as { at: string; result: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads storage once after mount
      setText(`Update check ${new Date(at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}: ${result}`);
    } catch {
      // ignore
    }
  }, []);
  return text ? <p className="text-muted-foreground -mt-2 text-center text-[11px]" data-testid="update-status">{text}</p> : null;
}
