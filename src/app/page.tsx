import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { BrowserFrame, PhoneFrame, ProductShot } from "@/components/landing/product-shot";
import { FeatureTabs } from "@/components/landing/feature-tabs";
import { ChatDemo } from "@/components/landing/chat-demo";

const PROBLEMS = [
  {
    problem: "The phone rings while everyone's with a client",
    fix: "The AI receptionist answers chats and calls, and books the slot itself.",
  },
  {
    problem: "Two people end up in the same time slot",
    fix: "One slot engine decides every time. A taken slot can't be booked twice.",
  },
  {
    problem: "Clients book and don't turn up",
    fix: "Deposits at booking and a cancellation window you set.",
  },
  {
    problem: "Bookings, payments and notes live in different places",
    fix: "One dashboard for the calendar, clients, conversations and payments.",
  },
];

const STEPS = [
  { title: "The client picks a time", body: "On the booking page, in chat or on a call. Only real free slots are offered." },
  { title: "The slot is held", body: "Nobody else can take it for 10 minutes while the client pays the deposit." },
  { title: "It's confirmed everywhere", body: "Confirmation email to the client, a heads-up to the stylist, and it's on the calendar." },
  { title: "Changes look after themselves", body: "The client can move or cancel from the email; the policy is applied for you." },
];

const TYPES = [
  { name: "Hair salons", body: "Stylists, colour, add-ons and long services like balayage." },
  { name: "Spas and skin", body: "Facials, massages and treatments with clean-up time between." },
  { name: "Barbershops", body: "Quick cuts, walk-ins and a calendar that fills itself." },
  { name: "Clinics", body: "Appointments, deposits and reminders that cut no-shows." },
  { name: "Tutors and coaches", body: "Sessions by the hour, booked and paid in advance." },
  { name: "Studios", body: "Tattoo, nails, lashes: any business that sells time." },
];

const BUILT = [
  { title: "No double booking, ever", body: "Every booking re-checks availability in a single transaction. In production this is a Postgres exclusion constraint." },
  { title: "Time zones done right", body: "Times are stored in UTC and shown in the business's zone, including daylight-saving days." },
  { title: "Tested where it matters", body: "29 automated tests cover the slot engine, holds, refunds and receptionist conversations." },
  { title: "Your brand, not ours", body: "Every color is a theme token. Switch the whole product to a client's brand in one place." },
  { title: "Ready for real services", body: "Stripe, Resend, Supabase and a voice provider plug in behind the same functions." },
  { title: "Built for phones first", body: "Most clients book from Instagram or Google Maps on a phone. The booking flow is designed for that." },
];

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span aria-hidden className="grid h-7 w-7 grid-cols-2 gap-0.5 rounded-lg bg-accent p-1">
              <span className="rounded-sm bg-on-accent" />
              <span className="rounded-sm bg-on-accent/50" />
              <span className="rounded-sm bg-on-accent/50" />
              <span className="rounded-sm bg-on-accent" />
            </span>
            Slotly
          </Link>
          <nav className="hidden items-center gap-1 text-[15px] md:flex">
            <a href="#product" className="rounded-lg px-3 py-2 text-ink-2 hover:text-ink">Product</a>
            <a href="#receptionist" className="rounded-lg px-3 py-2 text-ink-2 hover:text-ink">AI receptionist</a>
            <a href="#who" className="rounded-lg px-3 py-2 text-ink-2 hover:text-ink">Who it&apos;s for</a>
            <a href="#built" className="rounded-lg px-3 py-2 text-ink-2 hover:text-ink">How it&apos;s built</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/app" className="hidden rounded-xl px-3 py-2 text-[15px] font-medium text-ink-2 hover:text-ink sm:block">
              Owner login
            </Link>
            <ButtonLink href="/b/lumen-studio">Try the live demo</ButtonLink>
          </div>
        </div>
      </header>

      {/* Hero: the product itself is the picture */}
      <section className="relative">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-accent-soft/60" />
        <div className="mx-auto max-w-7xl px-5 pt-16 text-center sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-ink-2 ring-1 ring-line">
            <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
            Now with a voice receptionist
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-[clamp(2.75rem,7vw,5.75rem)] font-bold leading-[0.95] tracking-[-0.035em]">
            The front desk that never misses a booking
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            Online booking, deposits, a live team calendar and an AI receptionist for salons, clinics and studios, all
            working from one schedule that can&apos;t double-book.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/b/lumen-studio" className="px-6 py-3.5 text-base">
              Book as a customer
            </ButtonLink>
            <ButtonLink href="/app" variant="secondary" className="px-6 py-3.5 text-base">
              Open the owner dashboard
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-ink-3">Live demo with a fictional salon, Lumen Studio. No sign-up.</p>
        </div>

        <div className="relative mx-auto mt-14 max-w-6xl px-5 pb-8">
          <BrowserFrame>
            <ProductShot name="calendar" alt="The Slotly team calendar with today's appointments for four staff" priority />
          </BrowserFrame>
          <PhoneFrame className="absolute -bottom-4 left-0 hidden w-[23%] max-w-[250px] -rotate-2 sm:block lg:-left-6">
            <ProductShot name="booking-mobile" alt="Choosing a time on the Lumen Studio booking page" priority />
          </PhoneFrame>
          <div className="absolute -right-2 top-1/3 hidden w-72 rounded-2xl bg-surface p-4 text-left shadow-[0_30px_60px_-25px_rgba(12,12,20,0.5)] ring-1 ring-line md:block lg:-right-8">
            <p className="text-xs text-ink-3">New booking from the AI receptionist</p>
            <p className="mt-1 font-medium">Rina Shah booked a balayage</p>
            <p className="text-sm text-ink-2">Sat 2:30 PM with Ava, $78 deposit paid</p>
          </div>
        </div>
      </section>

      {/* What it fixes */}
      <section className="mx-auto max-w-7xl px-5 py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Every missed call is a missed booking</h2>
          <p className="mt-4 text-lg text-ink-2">
            Service businesses lose bookings in the same four ways. Slotly is built around fixing each one.
          </p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl bg-line ring-1 ring-line sm:grid-cols-2">
          {PROBLEMS.map((p) => (
            <div key={p.problem} className="bg-surface p-7">
              <p className="text-lg text-ink-3 line-through decoration-ink-3/40">{p.problem}</p>
              <p className="mt-3 text-xl font-medium leading-snug">{p.fix}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product tour */}
      <section id="product" className="scroll-mt-20 bg-surface py-24">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">One product for the whole front desk</h2>
            <p className="mt-4 text-lg text-ink-2">Every screen below is the real app, with the demo salon&apos;s data.</p>
          </div>
          <FeatureTabs />
        </div>
      </section>

      {/* AI receptionist */}
      <section id="receptionist" className="scroll-mt-20 bg-contrast py-24 text-on-contrast">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">A receptionist that books, not just chats</h2>
            <p className="mt-5 text-lg leading-relaxed text-on-contrast/75">
              It reads what the client wants, checks the same calendar your team uses, holds the slot and takes the
              deposit. Owners see every conversation and the exact steps it took.
            </p>
            <dl className="mt-10 grid gap-6 sm:grid-cols-2">
              {[
                ["Answers from your data", "Prices, hours and policies come from your settings, never made up."],
                ["Books real slots", "It uses the same slot engine as the booking page."],
                ["Checks it's really them", "A 6-digit email code before moving or cancelling."],
                ["Knows when to hand off", "Flags the chat and emails the owner for a person to reply."],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="font-medium">{t}</dt>
                  <dd className="mt-1 text-on-contrast/70">{d}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10">
              <ButtonLink href="/b/lumen-studio" className="px-5 py-3">
                Chat or call it now
              </ButtonLink>
            </div>
          </div>
          <ChatDemo />
        </div>
      </section>

      {/* How a booking flows */}
      <section className="mx-auto max-w-7xl px-5 py-24">
        <h2 className="max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">From first tap to a full calendar</h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-accent pt-5">
              <span className="font-display text-sm font-semibold text-accent-dark">Step {i + 1}</span>
              <h3 className="mt-2 text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Who it's for */}
      <section id="who" className="scroll-mt-20 bg-surface py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Made for businesses that sell time</h2>
            <p className="mt-4 text-lg text-ink-2">
              Services, staff and hours are all settings, so the same product fits a salon, a clinic or a tutor.
            </p>
            <div className="mt-8 hidden max-w-[260px] lg:block">
              <PhoneFrame>
                <ProductShot name="business-mobile" alt="Lumen Studio's booking page on a phone" />
              </PhoneFrame>
            </div>
          </div>
          <ul className="grid content-start gap-4 sm:grid-cols-2">
            {TYPES.map((t) => (
              <li key={t.name} className="rounded-2xl bg-paper p-6 ring-1 ring-line">
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                <p className="mt-2 text-ink-2">{t.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it's built */}
      <section id="built" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Built like a real product</h2>
          <p className="mt-4 text-lg text-ink-2">The parts clients never see decide whether a booking system can be trusted.</p>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT.map((b) => (
            <div key={b.title}>
              <h3 className="text-lg font-medium">{b.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="px-5 pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-accent px-8 py-16 text-center text-on-accent sm:py-20">
          <h2 className="mx-auto max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-6xl">See it work in two minutes</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-on-accent/80">
            Book an appointment as a client, then open the owner dashboard in another tab and watch it arrive.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/b/lumen-studio" className="rounded-xl bg-surface px-6 py-3.5 text-base font-medium text-ink hover:bg-paper">
              Book as a customer
            </Link>
            <Link href="/app" className="rounded-xl px-6 py-3.5 text-base font-medium text-on-accent ring-1 ring-on-accent/40 hover:bg-on-accent/10">
              Open the owner dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-3">
          <span>Slotly demo. Payments, emails and the receptionist run in demo mode.</span>
          <span className="flex gap-4">
            <Link href="/b/lumen-studio" className="hover:text-ink">Booking page</Link>
            <Link href="/app" className="hover:text-ink">Dashboard</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
