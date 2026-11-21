import Link from "next/link";
import { ButtonLink } from "@/components/ui";

const features = [
  {
    title: "Booking that fits in a minute",
    body: "Customers pick a service, a person and a time, and pay a deposit from their phone. No account needed.",
  },
  {
    title: "A calendar that can't double-book",
    body: "Every booking checks the same slot engine, with buffers, breaks and time off built in. Two people can never take one slot.",
  },
  {
    title: "Deposits that cut no-shows",
    body: "Fixed or percentage deposits, a free-cancellation window, and refunds in one click.",
  },
  {
    title: "A receptionist that never misses a call",
    body: "Answers questions from your own service list and books real slots, in chat or by voice.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Slotly
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/b/lumen-studio" className="rounded-lg px-3 py-2 text-ink-2 hover:bg-mist">
            Customer demo
          </Link>
          <Link href="/app" className="rounded-lg px-3 py-2 text-ink-2 hover:bg-mist">
            Owner demo
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,6vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.03em]">
            Your appointment book, open all night.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            Slotly is online booking for salons, clinics and studios: a booking page, deposits, a team calendar and
            an AI receptionist, all working from one set of rules.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/b/lumen-studio" className="px-5 py-3 text-base">
              Book as a customer
            </ButtonLink>
            <ButtonLink href="/app" variant="secondary" className="px-5 py-3 text-base">
              Open the owner dashboard
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-ink-3">
            Live demo with a fictional salon, Lumen Studio. Tip: open both in two tabs and watch a booking appear.
          </p>
        </div>

        <SlotPreview />
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-10 px-5 py-16 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title}>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-2 max-w-md leading-relaxed text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-ink-3">
        Demo build. Payments, emails and the receptionist run in demo mode; the same code connects to Stripe, Resend
        and a voice provider with a business&apos;s own keys.
      </footer>
    </main>
  );
}

/** A static picture of the product: one day of a team calendar. */
function SlotPreview() {
  const cols = [
    { name: "Sara", color: "#7c6cf0", items: [[0, 2, "Women's cut"], [3, 1, "Fringe trim"], [5, 2, "Wash & blow-dry"]] },
    { name: "Ava", color: "#e8795a", items: [[0, 4, "Balayage"], [5, 2, "Root touch-up"]] },
    { name: "Noor", color: "#d4537e", items: [[1, 1, "Gel manicure"], [2.5, 2, "Signature facial"], [6, 1, "Brows"]] },
  ] as const;
  return (
    <div aria-hidden className="relative rounded-3xl bg-surface p-4 shadow-[0_30px_80px_-30px_rgba(31,26,46,0.35)] ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="font-display font-semibold">Today</span>
        <span className="rounded-full bg-glow-soft px-2.5 py-0.5 text-xs font-medium text-glow-ink">1 slot held</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.name}>
            <p className="mb-2 px-1 text-xs font-medium text-ink-3">{c.name}</p>
            <div className="relative h-72 rounded-xl bg-mist/60">
              {c.items.map(([top, h, label]) => (
                <div
                  key={label}
                  className="absolute inset-x-1 rounded-lg px-2 py-1.5 text-[11px] font-medium leading-tight text-white"
                  style={{ top: `${(top / 8) * 100}%`, height: `calc(${(h / 8) * 100}% - 4px)`, background: c.color }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute -bottom-5 right-6 rounded-2xl bg-contrast px-4 py-3 text-sm text-on-contrast shadow-xl">
        &ldquo;Saturday 3pm with Sara works. Booked.&rdquo;
      </div>
    </div>
  );
}
