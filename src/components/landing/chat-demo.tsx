"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const SCRIPT: { from: "client" | "ai"; text: string; tool?: string }[] = [
  { from: "client", text: "Hi, can I get a balayage with Ava on Saturday afternoon?" },
  { from: "ai", text: "Ava has 2:15, 2:30 or 3:00 PM on Saturday. Which works?", tool: "find_slots(Balayage, Ava, Sat) → 4 free" },
  { from: "client", text: "2:30 please" },
  { from: "ai", text: "Held for 10 minutes. What's your full name?", tool: "hold_slot(Sat 2:30 PM, Ava) → held" },
  { from: "client", text: "Rina Shah, rina@example.com" },
  { from: "ai", text: "Almost done. Balayage needs a $78 deposit to lock it in.", tool: "confirm_booking → payment link sent" },
];

/** A looping receptionist conversation, showing the tool call behind each reply. */
export function ChatDemo() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setCount(SCRIPT.length), 0);
      return () => clearTimeout(id);
    }
    const id = setInterval(() => setCount((c) => (c >= SCRIPT.length + 2 ? 1 : c + 1)), 1700);
    return () => clearInterval(id);
  }, []);

  const shown = SCRIPT.slice(0, Math.min(count, SCRIPT.length));

  return (
    <div className="rounded-3xl bg-surface p-5 text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] ring-1 ring-line" aria-label="Example receptionist chat">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display font-semibold text-on-accent">
          L<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-ok" />
        </span>
        <span>
          <span className="block text-sm font-medium">Lumen Studio receptionist</span>
          <span className="block text-xs text-ink-3">Replies instantly, day or night</span>
        </span>
      </div>
      <div className="mt-4 flex min-h-[330px] flex-col justify-end gap-2.5">
        {shown.map((m, i) => (
          <div key={i} className={clsx("animate-rise flex flex-col", m.from === "client" ? "items-end" : "items-start")}>
            <p
              className={clsx(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug",
                m.from === "client" ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-mist text-ink",
              )}
            >
              {m.text}
            </p>
            {m.tool && (
              <code className="mt-1 rounded-md bg-contrast px-2 py-0.5 text-[11px] text-on-contrast/80">{m.tool}</code>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
