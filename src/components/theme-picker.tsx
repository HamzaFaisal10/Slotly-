"use client";

import clsx from "clsx";
import { setTheme, THEMES, useTheme } from "@/lib/theme";

/** Switch the whole app between the four themes. Shown while the look is being chosen. */
export function ThemePicker() {
  const theme = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="fixed bottom-4 left-1/2 z-[55] hidden -translate-x-1/2 lg:flex items-center gap-1 rounded-full bg-surface p-1 text-xs shadow-lg ring-1 ring-line print:hidden"
    >
      <span className="hidden px-2 text-ink-3 sm:inline">Theme</span>
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => setTheme(t.id)}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium",
            theme === t.id ? "bg-contrast text-on-contrast" : "text-ink-2 hover:bg-mist",
          )}
        >
          <span className="flex">
            {t.swatch.map((c) => (
              <span key={c} className="-ml-0.5 h-3 w-3 rounded-full ring-1 ring-surface first:ml-0" style={{ background: c }} />
            ))}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
