"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenText, LayoutGrid, LogOut, Users } from "lucide-react";
import { useLedger } from "@/components/ledger-provider";
import { TabPager } from "@/components/tab-pager";
import { cn } from "cn";
import { MotionConfig, motion, useMotionValue } from "motion/react";
import { normalizePath, TAB_PATHS, tabIndexOf } from "@/lib/swipe";

const links = [
  { href: "/history", label: "History", icon: BookOpenText, testId: "nav-history" },
  { href: "/", label: "Ledger", icon: LayoutGrid, testId: "nav-ledger" },
  { href: "/people", label: "People", icon: Users, testId: "nav-people" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  // the static export (trailingSlash) reports "/history/"; compare without it
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const { profile, isAdmin, signOutUser, people } = useLedger();
  const linked = people.find((person) => person.id === profile?.personId);
  const active = Math.max(0, tabIndexOf(pathname));

  // shared by the pager (page offset) and the bottom bar (pill position)
  const drag = useMotionValue(0);
  const width = useMotionValue(typeof window === "undefined" ? 400 : window.innerWidth);
  const pillX = useMotionValue(0);
  const pillW = useMotionValue(0);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const rects = useRef<Array<{ left: number; width: number }>>([]);
  const activeRef = useRef(active);

  const placePill = useCallback(() => {
    const boxes = rects.current;
    if (boxes.length !== links.length) return;
    const w = width.get() || 1;
    const progress = Math.min(links.length - 1, Math.max(0, activeRef.current - drag.get() / w));
    const lower = Math.floor(progress);
    const upper = Math.min(links.length - 1, lower + 1);
    const t = progress - lower;
    pillX.set(boxes[lower].left + (boxes[upper].left - boxes[lower].left) * t);
    pillW.set(boxes[lower].width + (boxes[upper].width - boxes[lower].width) * t);
  }, [drag, pillW, pillX, width]);

  useLayoutEffect(() => {
    activeRef.current = active;
    const measure = () => {
      rects.current = linkRefs.current.map((el) => ({ left: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 }));
      placePill();
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, placePill]);

  useEffect(() => {
    const off = drag.on("change", placePill);
    return off;
  }, [drag, placePill]);

  const onNavigate = useCallback((index: number) => router.push(TAB_PATHS[index], { scroll: false }), [router]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-dark min-h-full text-white">
      <div aria-hidden className="status-scrim" />
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pt-[calc(1.25rem+var(--safe-top))] pb-2">
        <Image src="/logo-mark.png" alt="Plot Ledger" width={44} height={44} unoptimized priority className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-medium">{profile?.displayName ?? "Signed in"}</p>
          <p className="truncate text-xs text-white/65">
            {linked ? linked.name : "Not linked to the roster"}
            {isAdmin ? " · Admin" : " · Member"}
          </p>
        </div>
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
        <TabPager active={active} drag={drag} width={width} onNavigate={onNavigate} />
        {children}
      </main>
      <nav
        aria-label="Main"
        data-bottom-nav
        data-no-swipe
        className="fixed inset-x-0 bottom-[calc(1rem+var(--safe-bottom))] z-40 flex justify-center px-4"
      >
        <ul className="relative flex items-center gap-1 rounded-full bg-[#0b0f1a] p-1.5 shadow-[0_6px_16px_rgb(0_0_0/0.4)] ring-1 ring-white/10">
          <motion.span
            aria-hidden
            className="absolute top-1.5 left-0 h-12 rounded-full bg-white"
            style={{ x: pillX, width: pillW }}
          />
          {links.map((link, index) => {
            const Icon = link.icon;
            const isActive = index === active;
            return (
              <li key={link.href}>
                <Link
                  ref={(el) => {
                    linkRefs.current[index] = el;
                  }}
                  href={link.href}
                  scroll={false}
                  data-testid={link.testId}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 min-w-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white",
                    isActive ? "px-6 text-[#0b0f1a]" : "text-white/70 hover:text-white",
                  )}
                >
                  <motion.span
                    className="relative inline-flex"
                    animate={isActive ? { scale: [1, 1.45, 0.9, 1.1, 1], rotate: [0, -14, 8, 0] } : { scale: 1, rotate: 0 }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </motion.span>
                  <span className={cn("relative", isActive ? "" : "sr-only sm:not-sr-only")}>{link.label}</span>
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
