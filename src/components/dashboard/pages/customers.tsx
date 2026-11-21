"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { fmtMoney } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/time";
import { Button, inputClass } from "@/components/ui";
import { PageTitle, ShellPage } from "../app-shell";
import type { Business } from "@/lib/types";

export function CustomersPage({ slug }: { slug: string }) {
  return <ShellPage slug={slug} active="customers">{(b) => <Customers business={b} />}</ShellPage>;
}

function Customers({ business }: { business: Business }) {
  const tz = business.timeZone;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [customers, bookings, services] = await Promise.all([
      db.customers.where("businessId").equals(business.id).toArray(),
      db.bookings.where("businessId").equals(business.id).toArray(),
      db.services.where("businessId").equals(business.id).toArray(),
    ]);
    return { customers, bookings, services };
  }, [business.id]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.customers
      .map((c) => {
        const mine = data.bookings.filter((b) => b.customerId === c.id);
        const visits = mine.filter((b) => b.status === "completed");
        return {
          c,
          mine: mine.sort((a, b) => b.startsAt - a.startsAt),
          visits: visits.length,
          spent: mine.reduce((s, b) => s + b.paidCents, 0),
          last: visits.reduce((m, b) => Math.max(m, b.startsAt), 0),
        };
      })
      .filter((r) => !q || `${r.c.name} ${r.c.email} ${r.c.phone}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.last - a.last);
  }, [data, q]);

  if (!data) return null;
  const sel = rows.find((r) => r.c.id === open);

  const exportCsv = () => {
    const lines = [["Name", "Email", "Phone", "Visits", "Spent", "No-shows", "Last visit"].join(",")];
    for (const r of rows)
      lines.push(
        [r.c.name, r.c.email, r.c.phone, r.visits, (r.spent / 100).toFixed(2), r.c.noShowCount, r.last ? fmtDate(r.last, tz, "yyyy-MM-dd") : ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lumen-studio-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageTitle
        title="Customers"
        sub={`${data.customers.length} people have booked with ${business.name}.`}
        actions={
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" aria-label="Search customers" className={`${inputClass} w-64`} />
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 text-right font-medium">Visits</th>
              <th className="px-4 py-3 text-right font-medium">Spent</th>
              <th className="px-4 py-3 text-right font-medium">No-shows</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.c.id} onClick={() => setOpen(r.c.id)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper">
                <td className="px-4 py-3">
                  <span className="font-medium">{r.c.name}</span>
                  <span className="block text-xs text-ink-3">{r.c.email || "No email"}</span>
                </td>
                <td className="px-4 py-3 text-ink-2">{r.c.phone}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.visits}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.spent, business.currency)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.c.noShowCount ? "text-bad" : ""}`}>{r.c.noShowCount}</td>
                <td className="px-4 py-3 text-ink-2">{r.last ? fmtDate(r.last, tz, "d MMM yyyy") : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-ink-2">No customers match “{q}”.</p>}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={() => setOpen(null)}>
          <aside onClick={(e) => e.stopPropagation()} className="animate-rise h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" aria-label={sel.c.name}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">{sel.c.name}</h2>
                <p className="text-sm text-ink-2">{sel.c.email || "No email"} · {sel.c.phone}</p>
              </div>
              <button onClick={() => setOpen(null)} className="rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-mist">
                Close
              </button>
            </div>
            <label className="mt-6 block">
              <span className="text-sm font-medium">Notes for the team</span>
              <textarea
                key={sel.c.id}
                defaultValue={sel.c.notes}
                onBlur={(e) => getDb().customers.update(sel.c.id, { notes: e.target.value })}
                placeholder="Allergies, preferences, anything useful next time"
                className={`${inputClass} mt-1.5 min-h-24`}
              />
              <span className="text-xs text-ink-3">Saved when you click away. Staff see it on every booking.</span>
            </label>
            <h3 className="mt-6 text-sm font-medium text-ink-3">Bookings</h3>
            <ul className="mt-2 divide-y divide-line">
              {sel.mine.map((b) => (
                <li key={b.id}>
                  <Link href={`/app/${business.slug}/bookings/${b.code}`} className="flex justify-between gap-3 py-2.5 text-sm hover:text-violet-dark">
                    <span>
                      {data.services.find((s) => s.id === b.serviceId)?.name}
                      <span className="block text-xs text-ink-3">
                        {fmtDate(b.startsAt, tz, "EEE d MMM yyyy")}, {fmtTime(b.startsAt, tz)}
                      </span>
                    </span>
                    <span className="text-right capitalize text-ink-2">{b.status.replace("_", " ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
