"use client";

import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "blush", label: "Blush", swatch: ["#b23a5b", "#f8dce3", "#3a1424"] },
  { id: "sage", label: "Sage", swatch: ["#2f6b5a", "#dcebe3", "#13231f"] },
  { id: "midnight", label: "Midnight", swatch: ["#d8b47a", "#2a2133", "#14101a"] },
  { id: "graphite", label: "Graphite", swatch: ["#2f54eb", "#d7f75b", "#18181b"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "blush";
import { THEME_KEY as KEY } from "./theme-boot";

const listeners = new Set<() => void>();

function current(): ThemeId {
  const t = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  return (THEMES.some((x) => x.id === t) ? t : DEFAULT_THEME) as ThemeId;
}

export function setTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => DEFAULT_THEME,
  );
}
