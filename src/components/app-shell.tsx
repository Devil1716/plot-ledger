"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, LayoutGrid, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLedger } from "@/components/ledger-provider";
import { cn } from "cn";

const links = [
  { href: "/", label: "Ledger", icon: LayoutGrid, testId: "nav-ledger" },
  { href: "/history", label: "History", icon: BookOpenText, testId: "nav-history" },
  { href: "/people", label: "People", icon: Users, testId: "nav-people" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, isAdmin, signOutUser, people } = useLedger();
  const linked = people.find((person) => person.id === profile?.personId);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <span className="block h-4 w-3 border border-current">
                <span className="block h-1/2 border-b border-current" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-lg leading-none font-semibold tracking-tight">
                Plot Ledger
              </span>
              <span className="text-muted-foreground hidden text-xs sm:block">54 ft × 105 ft shared plot</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={link.testId}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  pathname === link.href ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{profile?.displayName ?? "Signed in"}</p>
              <p className="text-muted-foreground text-xs">
                {linked ? linked.name : "Not linked to the roster"}
                {isAdmin ? " · Admin" : " · Read only"}
              </p>
            </div>
            <Button variant="outline" size="icon" aria-label="Sign out" onClick={() => void signOutUser()}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-3">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={`${link.testId}-mobile`}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
