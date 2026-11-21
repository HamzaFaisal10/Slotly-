"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ensureSeeded } from "@/lib/store";
import { expireHolds } from "@/lib/bookings";
import { DemoInbox } from "./demo-inbox";

/**
 * Loads the demo business into this browser on first visit and keeps
 * releasing unpaid holds (in production a scheduled job does this).
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ensureSeeded()
      .then(() => alive && setReady(true))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    const timer = setInterval(() => void expireHolds().catch(() => {}), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="font-display text-xl">This demo needs browser storage.</p>
        <p className="mt-2 text-ink-2">
          Private browsing in some browsers blocks it. Open the link in a normal window to try the demo.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-live="polite">
        <span className="h-2 w-24 overflow-hidden rounded-full bg-mist">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-violet" />
        </span>
        <span className="sr-only">Loading the demo</span>
      </div>
    );
  }

  return (
    <>
      {children}
      <DemoInbox />
    </>
  );
}
