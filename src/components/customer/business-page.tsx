"use client";

import Link from "next/link";
import { useBusiness, useCatalog } from "@/lib/hooks";
import { fmtDuration, fmtMoney } from "@/lib/money";
import { Avatar, ButtonLink } from "@/components/ui";
import { NotFound } from "./not-found";
import { ChatWidget } from "@/components/receptionist/chat-widget";
import type { Business, Service } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function to12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`;
}

function depositLabel(s: Service, currency: string) {
  if (s.depositType === "none") return null;
  if (s.depositType === "fixed") return `${fmtMoney(s.depositValue, currency)} deposit`;
  return `${s.depositValue}% deposit`;
}

export function BusinessPage({ slug }: { slug: string }) {
  const business = useBusiness(slug);
  const catalog = useCatalog(business?.id);
  if (business === undefined || (business && !catalog)) return null;
  if (!business) return <NotFound />;
  const { categories, services, staff } = catalog!;

  return (
    <main className="pb-28">
      <Hero business={business} />

      <div className="mx-auto grid max-w-5xl gap-12 px-5 py-10 lg:grid-cols-[1fr_300px]">
        <div className="space-y-12">
          <section aria-labelledby="services">
            <h2 id="services" className="font-display text-2xl font-semibold tracking-tight">
              Services
            </h2>
            <div className="mt-5 space-y-8">
              {categories.map((cat) => (
                <div key={cat.id}>
                  <h3 className="mb-2 text-sm font-medium text-ink-3">{cat.name}</h3>
                  <ul className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
                    {services
                      .filter((s) => s.categoryId === cat.id)
                      .map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/b/${slug}/book?service=${s.id}`}
                            className="group flex items-start justify-between gap-4 px-4 py-4 hover:bg-paper"
                          >
                            <span className="min-w-0">
                              <span className="block font-medium group-hover:text-violet-dark">{s.name}</span>
                              <span className="mt-0.5 block text-sm text-ink-3">{s.description}</span>
                              <span className="mt-1.5 block text-sm text-ink-2">
                                {fmtDuration(s.durationMin)}
                                {depositLabel(s, business.currency) && (
                                  <span className="text-ink-3">, {depositLabel(s, business.currency)}</span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-medium">{fmtMoney(s.priceCents, business.currency)}</span>
                              <span className="mt-2 inline-block rounded-lg bg-mist px-2.5 py-1 text-sm font-medium text-ink group-hover:bg-violet group-hover:text-white">
                                Book
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="team">
            <h2 id="team" className="font-display text-2xl font-semibold tracking-tight">
              Team
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {staff.map((m) => (
                <li key={m.id} className="flex gap-3">
                  <Avatar name={m.name} color={m.color} size={48} />
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-ink-3">{m.title}</p>
                    <p className="mt-1 text-sm text-ink-2">{m.bio}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-display text-lg font-semibold">Opening hours</h2>
            <dl className="mt-3 space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const h = business.hours.find((x) => x.weekday === d);
                return (
                  <div key={d} className="flex justify-between">
                    <dt className="text-ink-2">{DAYS[d]}</dt>
                    <dd className={h ? "" : "text-ink-3"}>{h ? `${to12(h.opens)} to ${to12(h.closes)}` : "Closed"}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Find us</h2>
            <p className="mt-2 text-ink-2">{business.address}</p>
            <p className="text-ink-2">{business.phone}</p>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Cancellation</h2>
            <p className="mt-2 text-ink-2">
              Free until {business.policy.freeCancelHours} hours before your appointment. After that the deposit is
              kept.
            </p>
          </div>
        </aside>
      </div>

      <ChatWidget business={business} />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 py-3 backdrop-blur lg:hidden">
        <ButtonLink href={`/b/${slug}/book`} className="w-full py-3 text-base">
          Book an appointment
        </ButtonLink>
      </div>
    </main>
  );
}

function Hero({ business }: { business: Business }) {
  return (
    <header className="relative overflow-hidden bg-ink text-white">
      {/* Light falling across the page: the "lumen" of Lumen Studio */}
      <div
        aria-hidden
        className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, #f2c14e55, transparent)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-56 left-10 h-[420px] w-[620px] rounded-full opacity-50"
        style={{ background: "radial-gradient(closest-side, #5b4bdb66, transparent)" }}
      />
      <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-6">
        <nav className="flex items-center justify-between text-sm text-white/70">
          <Link href="/" className="hover:text-white">
            Powered by Slotly
          </Link>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">Demo business</span>
        </nav>
        <p className="mt-14 text-white/70">{business.kind}</p>
        <h1 className="mt-2 font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.035em]">
          {business.name}
        </h1>
        <p className="mt-4 max-w-lg text-lg text-white/80">{business.about}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href={`/b/${business.slug}/book`} variant="secondary" className="px-5 py-3 text-base ring-0 hover:bg-glow">
            Book an appointment
          </ButtonLink>
          <span className="text-sm text-white/60">{business.address}</span>
        </div>
      </div>
    </header>
  );
}
