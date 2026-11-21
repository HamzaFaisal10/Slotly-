"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { BrowserFrame, PhoneFrame, ProductShot, type ShotName } from "./product-shot";

const TABS: {
  id: string;
  label: string;
  title: string;
  body: string;
  points: string[];
  cta: { label: string; href: string };
  shot: ShotName;
  phone?: ShotName;
}[] = [
  {
    id: "booking",
    label: "Online booking",
    title: "A booking page clients finish in under a minute",
    body: "Service, person, time, deposit. Only times that really work are shown, and the slot is held while the client pays.",
    points: ["No account needed to book", "Add-ons, buffers and breaks built in", "Reschedule or cancel from the email link"],
    cta: { label: "Book as a customer", href: "/b/lumen-studio" },
    shot: "calendar",
    phone: "booking-mobile",
  },
  {
    id: "calendar",
    label: "Team calendar",
    title: "The whole day on one screen",
    body: "A column per team member, updating live. Drag a booking to move it and the client is emailed; click an empty spot for a walk-in.",
    points: ["Live updates across devices", "Breaks, time off and closed days shaded", "Check-in, done and no-show in one tap"],
    cta: { label: "Open the dashboard", href: "/app" },
    shot: "calendar",
  },
  {
    id: "receptionist",
    label: "AI receptionist",
    title: "Every chat and call answered, every action on record",
    body: "The receptionist books, moves and cancels real appointments. The owner sees each conversation with the exact steps it took.",
    points: ["Answers from your own prices and hours", "Verifies by email before changing a booking", "Hands off to a person when it should"],
    cta: { label: "Chat with it", href: "/b/lumen-studio" },
    shot: "conversations",
    phone: "chat-mobile",
  },
  {
    id: "payments",
    label: "Deposits and payments",
    title: "Deposits that keep the calendar honest",
    body: "Fixed or percentage deposits at booking, the balance at the visit, and refunds that follow your cancellation policy automatically.",
    points: ["Free cancellation window you set", "One-click refunds", "Every payment tied to its booking"],
    cta: { label: "See payments", href: "/app" },
    shot: "payments",
  },
  {
    id: "customers",
    label: "Clients",
    title: "Know every client before they sit down",
    body: "Visit history, money spent, no-shows and notes the whole team can see, like an allergy or a preferred stylist.",
    points: ["Search by name, email or phone", "Notes shown on every booking", "Export to CSV any time"],
    cta: { label: "See clients", href: "/app" },
    shot: "customers",
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active)!;

  return (
    <div>
      <div role="tablist" aria-label="Product features" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={clsx(
              "shrink-0 rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
              t.id === active ? "bg-contrast text-on-contrast" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab.id}`}
        aria-labelledby={`tab-${tab.id}`}
        key={tab.id}
        className="animate-rise mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]"
      >
        <div>
          <h3 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{tab.title}</h3>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{tab.body}</p>
          <ul className="mt-6 space-y-3">
            {tab.points.map((p) => (
              <li key={p} className="flex gap-3 text-ink">
                <svg className="mt-1 shrink-0 text-accent" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="m5 12 5 5 9-10" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          <Link href={tab.cta.href} className="mt-8 inline-flex items-center gap-2 font-medium text-accent-dark underline-offset-4 hover:underline">
            {tab.cta.label}
          </Link>
        </div>
        <div className="relative pb-10 lg:pb-0">
          <BrowserFrame>
            <ProductShot name={tab.shot} alt={`${tab.label} in the Slotly dashboard`} />
          </BrowserFrame>
          {tab.phone && (
            <PhoneFrame className="absolute -bottom-2 -right-2 w-[34%] max-w-[230px] sm:-right-6">
              <ProductShot name={tab.phone} alt={`${tab.label} on a phone`} />
            </PhoneFrame>
          )}
        </div>
      </div>
    </div>
  );
}
