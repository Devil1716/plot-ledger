"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { collection, doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { firebaseReady } from "@/lib/firebase";
import { computeShares, type ShareRow } from "@/lib/ledger-math";
import {
  parseAudit,
  parsePayment,
  parsePerson,
  parseUser,
  type AuditRecord,
  type PaymentRecord,
  type PersonRecord,
  type UserRecord,
} from "@/lib/records";
import { ensureProfile, queueProfileName, tryBootstrapAdmin } from "@/lib/session";

interface LedgerContextValue {
  status: "loading" | "signed-out" | "ready" | "error";
  dataReady: boolean;
  error: string | null;
  user: User | null;
  profile: UserRecord | null;
  isAdmin: boolean;
  adminUids: string[];
  accessCreatedAt: Timestamp | null;
  people: PersonRecord[];
  payments: PaymentRecord[];
  audit: AuditRecord[];
  accounts: UserRecord[];
  shares: ShareRow[];
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      return "That email and password don't match.";
    }
    if (code.includes("email-already-in-use")) return "An account with that email already exists. Sign in instead.";
    if (code.includes("weak-password")) return "Use at least 6 characters.";
    if (code.includes("invalid-email")) return "Enter a valid email address.";
    if (code.includes("popup-closed")) return "Google sign-in was closed before it finished.";
    if (code.includes("permission-denied")) return "You don't have permission to change the ledger.";
    if (code.includes("too-many-requests")) return "Too many attempts. Wait a minute and try again.";
    if (code.includes("user-disabled")) return "This account has been turned off. Ask an admin.";
    if (code.includes("missing-password")) return "Enter your password.";
    if (code.includes("unavailable") || code.includes("network")) {
      return process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
        ? "Can't reach the Firebase emulators. Start them and refresh."
        : "No connection. Check your internet and try again.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LedgerContextValue["status"]>("loading");
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [accessCreatedAt, setAccessCreatedAt] = useState<Timestamp | null>(null);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [accounts, setAccounts] = useState<UserRecord[]>([]);

  useEffect(() => {
    let generation = 0;
    const unsubs: Array<() => void> = [];
    let detachAuth = () => {};

    const stopData = () => {
      while (unsubs.length > 0) unsubs.pop()?.();
    };

    void firebaseReady()
      .then(({ auth, db }) => {
        detachAuth = onAuthStateChanged(auth, (nextUser) => {
          generation += 1;
          const current = generation;
          stopData();
          setDataReady(false);
          setAccounts([]);
          if (!nextUser) {
            setUser(null);
            setProfile(null);
            setAdminUids([]);
            setAccessCreatedAt(null);
            setPeople([]);
            setPayments([]);
            setAudit([]);
            setError(null);
            setStatus("signed-out");
            return;
          }

          setStatus("loading");
          void (async () => {
            try {
              await ensureProfile(db, nextUser);
              await tryBootstrapAdmin(db, nextUser);
              if (current !== generation) return;
              setUser(nextUser);
              setError(null);
              const loaded = new Set<string>();
              const mark = (key: string) => {
                loaded.add(key);
                if (loaded.size >= 3) setDataReady(true);
              };
              const fail = (snapshotError: unknown) => {
                if (current !== generation) return;
                setError(errorMessage(snapshotError));
                setStatus("error");
              };

              unsubs.push(
                onSnapshot(
                  doc(db, "users", nextUser.uid),
                  (snap) => setProfile(parseUser(nextUser.uid, snap.data())),
                  fail,
                ),
              );
              unsubs.push(
                onSnapshot(
                  doc(db, "settings", "access"),
                  (snap) => {
                    const data = snap.data();
                    const uids = Array.isArray(data?.adminUids)
                      ? data.adminUids.filter((uid): uid is string => typeof uid === "string")
                      : [];
                    setAdminUids(uids);
                    setAccessCreatedAt(
                      data?.createdAt && typeof data.createdAt === "object" ? (data.createdAt as Timestamp) : null,
                    );
                  },
                  fail,
                ),
              );
              unsubs.push(
                onSnapshot(
                  collection(db, "people"),
                  (snap) => {
                    setPeople(
                      snap.docs
                        .map((item) => parsePerson(item.id, item.data()))
                        .filter((item): item is PersonRecord => item !== null)
                        .sort((a, b) => a.sortOrder - b.sortOrder),
                    );
                    mark("people");
                  },
                  fail,
                ),
              );
              unsubs.push(
                onSnapshot(
                  collection(db, "payments"),
                  (snap) => {
                    setPayments(
                      snap.docs
                        .map((item) => parsePayment(item.id, item.data()))
                        .filter((item): item is PaymentRecord => item !== null)
                        .sort((a, b) => b.date.getTime() - a.date.getTime()),
                    );
                    mark("payments");
                  },
                  fail,
                ),
              );
              unsubs.push(
                onSnapshot(
                  collection(db, "audit"),
                  (snap) => {
                    setAudit(
                      snap.docs
                        .map((item) => parseAudit(item.id, item.data()))
                        .filter((item): item is AuditRecord => item !== null)
                        .sort((a, b) => b.at.getTime() - a.at.getTime()),
                    );
                    mark("audit");
                  },
                  fail,
                ),
              );
              setStatus("ready");
            } catch (setupError) {
              if (current !== generation) return;
              setError(errorMessage(setupError));
              setStatus("error");
            }
          })();
        });
      })
      .catch((setupError: unknown) => {
        setError(errorMessage(setupError));
        setStatus("error");
      });

    return () => {
      generation += 1;
      detachAuth();
      stopData();
    };
  }, []);

  const isAdmin = Boolean(user && adminUids.includes(user.uid));

  useEffect(() => {
    if (!isAdmin) return;
    let unsub = () => {};
    let cancelled = false;
    void firebaseReady().then(({ db }) => {
      if (cancelled) return;
      unsub = onSnapshot(collection(db, "users"), (snap) => {
        setAccounts(
          snap.docs
            .map((item) => parseUser(item.id, item.data()))
            .filter((item): item is UserRecord => item !== null)
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        );
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [isAdmin]);

  const shares = useMemo(
    () =>
      computeShares(
        people.map((person) => ({ id: person.id, role: person.role })),
        payments.map((payment) => ({ personId: payment.personId, amountPaise: payment.amountPaise })),
      ),
    [people, payments],
  );

  const value = useMemo<LedgerContextValue>(
    () => ({
      status,
      dataReady,
      error,
      user,
      profile,
      isAdmin,
      adminUids,
      accessCreatedAt,
      people,
      payments,
      audit,
      accounts,
      shares,
      signInEmail: async (email, password) => {
        const { auth } = await firebaseReady();
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signUpEmail: async (email, password, name) => {
        const trimmed = name.trim();
        queueProfileName(trimmed);
        try {
          const { auth } = await firebaseReady();
          const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
          if (trimmed) await updateProfile(credential.user, { displayName: trimmed.slice(0, 80) });
        } catch (error) {
          queueProfileName("");
          throw error;
        }
      },
      signInGoogle: async () => {
        const { auth } = await firebaseReady();
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOutUser: async () => {
        const { auth } = await firebaseReady();
        await signOut(auth);
      },
    }),
    [
      accounts,
      adminUids,
      accessCreatedAt,
      audit,
      dataReady,
      error,
      isAdmin,
      payments,
      people,
      profile,
      shares,
      status,
      user,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedger must be used inside LedgerProvider");
  return value;
}

export function authErrorMessage(error: unknown): string {
  return errorMessage(error);
}

