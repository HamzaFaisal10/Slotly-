"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { useBusiness } from "@/lib/hooks";
import { signOut, useSession, type DemoSession, type Role } from "@/lib/session";
import { Avatar, Button } from "@/components/ui";
import type { Business } from "@/lib/types";

export type NavKey = "calendar" | "conversations" | "customers" | "services" | "team" | "payments";

const NAV: { key: NavKey; label: string; path: string; roles: Role[] }[] = [
  { key: "calendar", label: "Calendar", path: "", roles: ["owner", "manager", "staff"] },
  { key: "conversations", label: "Conversations", path: "/conversations", roles: ["owner", "manager"] },
  { key: "customers", label: "Customers", path: "/customers", roles: ["owner", "manager"] },
  { key: "services", label: "Services", path: "/services", roles: ["owner"] },
  { key: "team", label: "Team", path: "/team", roles: ["owner"] },
  { key: "payments", label: "Payments", path: "/payments", roles: ["owner"] },
];

const noopSubscribe = () => () => {};

/** Signed-in session + business for dashboard pages; sends visitors without a demo role to sign-in. */
export function useAppSession(slug: string) {
  const router = useRouter();
  const session = useSession();
  const business = useBusiness(slug);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  useEffect(() => {
    if (mounted && !session) router.replace("/app");
  }, [mounted, session, router]);
  return { mounted, session, business };
}

export function AppShell({
  business,
  session,
  active,
  children,
}: {
  business: Business;
  session: DemoSession;
  active: NavKey;
  children: ReactNode;
}) {
  const router = useRouter();
  const color = useLiveQuery(
    async () => (session.staffId ? (await getDb().staff.get(session.staffId))?.color : undefined),
    [session.staffId],
  );
  const needsHuman = useLiveQuery(
    () => getDb().conversations.where("businessId").equals(business.id).filter((c) => c.needsHuman).count(),
    [business.id],
  );
  const items = NAV.filter((n) => n.roles.includes(session.role));
  const allowed = items.some((n) => n.key === active);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 pt-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-lg font-bold">
              Slotly
            </Link>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <span className="hidden font-medium sm:block">{business.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/b/${business.slug}`}
              target="_blank"
              className="hidden rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-mist md:block"
            >
              Open booking page
            </Link>
            <span className="flex items-center gap-2 rounded-xl bg-mist py-1 pl-1 pr-3 text-sm">
              <Avatar name={session.name} color={color ?? (session.role === "owner" ? "#1f1a2e" : "#4d4763")} size={28} />
              <span>
                <span className="hidden sm:inline">{session.name}</span>
                <span className="text-ink-3 sm:before:content-['_·_']">{session.role}</span>
              </span>
            </span>
            <Button
              variant="ghost"
              className="px-3 py-2 text-sm"
              onClick={() => {
                signOut();
                router.push("/app");
              }}
            >
              Switch role
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 pt-2" aria-label="Dashboard">
          {items.map((n) => (
            <Link
              key={n.key}
              href={`/app/${business.slug}${n.path}`}
              aria-current={n.key === active ? "page" : undefined}
              className={clsx(
                "relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-1.5 text-sm",
                n.key === active ? "font-medium text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet" : "text-ink-2 hover:text-ink",
              )}
            >
              {n.label}
              {n.key === "conversations" && !!needsHuman && (
                <span className="rounded-full bg-glow px-1.5 text-[11px] font-semibold text-ink">{needsHuman}</span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {allowed ? children : <p className="py-20 text-center text-ink-2">This page is for the owner. Switch role to see it.</p>}
      </main>
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-ink-2">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A dashboard page: signs in, loads the business, and wraps the content in the shell. */
export function ShellPage({
  slug,
  active,
  children,
}: {
  slug: string;
  active: NavKey;
  children: (business: Business, session: DemoSession) => ReactNode;
}) {
  const { mounted, session, business } = useAppSession(slug);
  if (!mounted || !session || !business) return null;
  return (
    <AppShell business={business} session={session} active={active}>
      {children(business, session)}
    </AppShell>
  );
}
