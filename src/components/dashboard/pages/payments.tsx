"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { fmtMoney } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/time";
import { Badge } from "@/components/ui";
import { PageTitle, ShellPage } from "../app-shell";
import type { Business, PaymentKind } from "@/lib/types";

export function PaymentsPage({ slug }: { slug: string }) {
  return <ShellPage slug={slug} active="payments">{(b) => <Payments business={b} />}</ShellPage>;
}

const FILTERS: { key: PaymentKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deposit", label: "Deposits" },
  { key: "balance", label: "Paid at visit" },
  { key: "refund", label: "Refunds" },
];

function Payments({ business }: { business: Business }) {
  const tz = business.timeZone;
  const cur = business.currency;
  const [filter, setFilter] = useState<PaymentKind | "all">("all");
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [payments, bookings, customers] = await Promise.all([
      db.payments.where("businessId").equals(business.id).reverse().sortBy("createdAt"),
      db.bookings.where("businessId").equals(business.id).toArray(),
      db.customers.where("businessId").equals(business.id).toArray(),
    ]);
    return { payments, bookings, customers };
  }, [business.id]);
  if (!data) return null;

  const rows = data.payments.filter((p) => filter === "all" || p.kind === filter).slice(0, 200);
  const sum = (k: PaymentKind) => data.payments.filter((p) => p.kind === k).reduce((s, p) => s + p.amountCents, 0);
  const net = data.payments.reduce((s, p) => s + p.amountCents, 0);

  return (
    <>
      <PageTitle title="Payments" sub="Deposits taken online, balances paid at visits, and refunds. In a live build these come from Stripe." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Net received", fmtMoney(net, cur)],
          ["Deposits", fmtMoney(sum("deposit"), cur)],
          ["Paid at visits", fmtMoney(sum("balance"), cur)],
          ["Refunded", fmtMoney(Math.abs(sum("refund")), cur)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <p className="text-sm text-ink-2">{k}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx("rounded-full px-3 py-1.5 text-sm", filter === f.key ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:ring-ink-3")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Booking</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const b = data.bookings.find((x) => x.id === p.bookingId);
              const c = data.customers.find((x) => x.id === b?.customerId);
              return (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 text-ink-2">
                    {fmtDate(p.createdAt, tz, "d MMM")}, {fmtTime(p.createdAt, tz)}
                  </td>
                  <td className="px-4 py-2.5">{c?.name ?? "Customer"}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.kind === "refund" ? "bad" : p.kind === "deposit" ? "violet" : "neutral"}>
                      {p.kind === "deposit" ? "Deposit" : p.kind === "balance" ? "At visit" : "Refund"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {b && (
                      <Link href={`/app/${business.slug}/bookings/${b.code}`} className="text-violet-dark hover:underline">
                        {b.code}
                      </Link>
                    )}
                  </td>
                  <td className={clsx("px-4 py-2.5 text-right font-medium tabular-nums", p.amountCents < 0 && "text-bad")}>
                    {fmtMoney(p.amountCents, cur)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
