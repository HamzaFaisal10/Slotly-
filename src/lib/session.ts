"use client";

import { useSyncExternalStore } from "react";

/**
 * Demo sign-in. In production this is Supabase Auth plus a row in
 * business_members; here a visitor picks a role with one click.
 */
export type Role = "owner" | "manager" | "staff";

export interface DemoSession {
  role: Role;
  staffId?: string;
  name: string;
}

const KEY = "slotly-session";
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && emit();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function emit() {
  cached = read();
  listeners.forEach((l) => l());
}

function snapshot() {
  if (cached === undefined) cached = read();
  return cached;
}

export function useSession(): DemoSession | null {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

export function signIn(session: DemoSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
  emit();
}

export function signOut() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit();
}
