"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpenText, LayoutGrid, LogOut, Users } from "lucide-react";
import { useLedger } from "@/components/ledger-provider";
import { cn } from "cn";
import { MotionConfig, motion } from "motion/react";

const links = [
  { href: "/history", label: "History", icon: BookOpenText, testId: "nav-history" },
  { href: "/", label: "Ledger", icon: LayoutGrid, testId: "nav-ledger" },
  { href: "/people", label: "People", icon: Users, testId: "nav-people" },
];

const ORDER = ["/history", "/", "/people"];
let lastNavIndex = -1;

export function AppShell({ children }: { children: React.ReactNode }) {
  // the static export (trailingSlash) reports "/history/"; compare without it
  const rawPathname = usePathname();
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, "") : rawPathname;
  const { profile, isAdmin, signOutUser, people } = useLedger();
  const linked = people.find((person) => person.id === profile?.personId);
  const isLedger = pathname === "/";
  const navIndex = ORDER.indexOf(pathname);
  // direction-aware page slide: +1 when moving right in the nav order, -1 when moving left
  const [direction] = useState(() => (lastNavIndex < 0 || navIndex === lastNavIndex ? 0 : navIndex > lastNavIndex ? 1 : -1));
  useEffect(() => {
    lastNavIndex = navIndex;
  }, [navIndex]);
  const initials = (profile?.displayName ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-dark min-h-full text-white">
      <div aria-hidden className="status-scrim" />
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pt-[calc(1.25rem+var(--safe-top))] pb-2">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold ring-1 ring-white/20"
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-medium">{profile?.displayName ?? "Signed in"}</p>
          <p className="truncate text-xs text-white/65">
            {linked ? linked.name : "Not linked to the roster"}
            {isAdmin ? " · Admin" : " · Read only"}
          </p>
        </div>
        <p className="ml-auto hidden text-right sm:block">
          <span className="block text-sm font-semibold tracking-tight">Plot Ledger</span>
          <span className="block text-xs text-white/65">54 ft × 105 ft shared plot</span>
        </p>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => void signOutUser()}
          className="ml-auto grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:ml-3"
        >
          <LogOut className="size-4" />
        </button>
      </header>
      <main className="mx-auto w-full max-w-6xl px-0 pt-2 pb-0 sm:px-5 sm:pb-[calc(7rem+var(--safe-bottom))]">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, x: direction * 120, y: direction === 0 ? 16 : 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
        >
          {isLedger ? (
            children
          ) : (
            <motion.div
              className="sheet min-h-[70vh] rounded-t-[2rem] px-4 pt-6 pb-[calc(8rem+var(--safe-bottom))] sm:rounded-[2rem] sm:px-8 sm:pb-8"
              initial={{ y: "60vh" }}
              animate={{ y: 0 }}
              transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.05 }}
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      </main>
      <nav
        aria-label="Main"
        data-bottom-nav
        className="fixed inset-x-0 bottom-[calc(1rem+var(--safe-bottom))] z-40 flex justify-center px-4"
      >
        <ul className="flex items-center gap-1 rounded-full bg-[#0b0f1a] p-1.5 shadow-[0_6px_16px_rgb(0_0_0/0.4)] ring-1 ring-white/10">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={link.testId}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 min-w-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white",
                    active ? "px-6 text-[#0b0f1a]" : "text-white/70 hover:text-white",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-white"
                      transition={{ type: "spring", stiffness: 380, damping: 19, mass: 0.9 }}
                    />
                  ) : null}
                  <motion.span
                    className="relative inline-flex"
                    animate={active ? { scale: [1, 1.45, 0.9, 1.1, 1], rotate: [0, -14, 8, 0] } : { scale: 1, rotate: 0 }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </motion.span>
                  <span className={cn("relative", active ? "" : "sr-only sm:not-sr-only")}>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
    </MotionConfig>
  );
}
