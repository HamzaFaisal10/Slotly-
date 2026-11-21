"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, uid } from "@/lib/db";
import { fmtDuration, fmtMoney } from "@/lib/money";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { PageTitle, ShellPage } from "../app-shell";
import type { Business, DepositType, Service } from "@/lib/types";

export function ServicesPage({ slug }: { slug: string }) {
  return <ShellPage slug={slug} active="services">{(b) => <Services business={b} />}</ShellPage>;
}

function Services({ business }: { business: Business }) {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [categories, services, staff] = await Promise.all([
      db.categories.where("businessId").equals(business.id).sortBy("position"),
      db.services.where("businessId").equals(business.id).toArray(),
      db.staff.where("businessId").equals(business.id).toArray(),
    ]);
    return { categories, services, staff };
  }, [business.id]);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  if (!data) return null;
  const cur = business.currency;

  return (
    <>
      <PageTitle
        title="Services"
        sub="What customers can book. Changes show on the booking page straight away."
        actions={<Button onClick={() => setEditing("new")}>Add service</Button>}
      />
      <div className="space-y-6">
        {data.categories.map((cat) => (
          <section key={cat.id}>
            <h2 className="mb-2 text-sm font-medium text-ink-3">{cat.name}</h2>
            <ul className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
              {data.services
                .filter((s) => s.categoryId === cat.id && !s.archivedAt)
                .map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setEditing(s)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-paper sm:grid-cols-[1fr_110px_120px_140px_90px]">
                      <span>
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-xs text-ink-3">
                          {data.staff.filter((m) => m.serviceIds.includes(s.id)).map((m) => m.name.split(" ")[0]).join(", ")}
                        </span>
                      </span>
                      <span className="hidden text-sm text-ink-2 sm:block">{fmtDuration(s.durationMin)}</span>
                      <span className="text-sm font-medium">{fmtMoney(s.priceCents, cur)}</span>
                      <span className="hidden text-sm text-ink-2 sm:block">
                        {s.depositType === "none" ? "No deposit" : s.depositType === "fixed" ? `${fmtMoney(s.depositValue, cur)} deposit` : `${s.depositValue}% deposit`}
                      </span>
                      <span className="hidden sm:block">{s.online ? <Badge tone="ok">Online</Badge> : <Badge>Hidden</Badge>}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {editing && (
        <ServiceForm
          business={business}
          service={editing === "new" ? null : editing}
          categories={data.categories}
          staff={data.staff}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ServiceForm({
  business,
  service,
  categories,
  staff,
  onClose,
}: {
  business: Business;
  service: Service | null;
  categories: { id: string; name: string }[];
  staff: { id: string; name: string; serviceIds: string[] }[];
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: service?.name ?? "",
    description: service?.description ?? "",
    categoryId: service?.categoryId ?? categories[0]?.id ?? "",
    durationMin: service?.durationMin ?? 45,
    bufferAfterMin: service?.bufferAfterMin ?? 10,
    price: (service?.priceCents ?? 5000) / 100,
    depositType: service?.depositType ?? ("none" as DepositType),
    deposit: service ? (service.depositType === "fixed" ? service.depositValue / 100 : service.depositValue) : 0,
    online: service?.online ?? true,
    staffIds: service ? staff.filter((m) => m.serviceIds.includes(service.id)).map((m) => m.id) : staff.map((m) => m.id),
  });
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return setError("Give the service a name.");
    if (f.durationMin < 5 || f.durationMin > 480) return setError("Length must be between 5 minutes and 8 hours.");
    if (f.price < 0) return setError("Price can't be negative.");
    const db = getDb();
    const id = service?.id ?? uid("svc");
    const next: Service = {
      id,
      businessId: business.id,
      categoryId: f.categoryId,
      name: f.name.trim(),
      description: f.description.trim(),
      durationMin: Number(f.durationMin),
      bufferBeforeMin: service?.bufferBeforeMin ?? 0,
      bufferAfterMin: Number(f.bufferAfterMin),
      priceCents: Math.round(Number(f.price) * 100),
      depositType: f.depositType,
      depositValue: f.depositType === "fixed" ? Math.round(Number(f.deposit) * 100) : Number(f.deposit),
      online: f.online,
      archivedAt: null,
    };
    await db.transaction("rw", db.services, db.staff, async () => {
      await db.services.put(next);
      for (const m of await db.staff.where("businessId").equals(business.id).toArray()) {
        const has = m.serviceIds.includes(id);
        const want = f.staffIds.includes(m.id);
        if (has !== want) await db.staff.update(m.id, { serviceIds: want ? [...m.serviceIds, id] : m.serviceIds.filter((x) => x !== id) });
      }
    });
    onClose();
  };

  const archive = async () => {
    if (!service) return;
    await getDb().services.update(service.id, { archivedAt: Date.now() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} noValidate className="animate-rise max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" aria-label="Service">
        <h2 className="font-display text-2xl font-semibold">{service ? "Edit service" : "New service"}</h2>
        <Field label="Name">
          <input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Category">
            <select className={inputClass} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length (min)">
            <input type="number" className={inputClass} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} />
          </Field>
          <Field label="Clean-up (min)">
            <input type="number" className={inputClass} value={f.bufferAfterMin} onChange={(e) => setF({ ...f, bufferAfterMin: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={`Price (${business.currency})`}>
            <input type="number" className={inputClass} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
          </Field>
          <Field label="Deposit">
            <select className={inputClass} value={f.depositType} onChange={(e) => setF({ ...f, depositType: e.target.value as DepositType })}>
              <option value="none">None</option>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent</option>
            </select>
          </Field>
          {f.depositType !== "none" && (
            <Field label={f.depositType === "fixed" ? `Amount (${business.currency})` : "Percent"}>
              <input type="number" className={inputClass} value={f.deposit} onChange={(e) => setF({ ...f, deposit: Number(e.target.value) })} />
            </Field>
          )}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Who does it</legend>
          <div className="flex flex-wrap gap-2">
            {staff.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                <input
                  type="checkbox"
                  className="accent-violet"
                  checked={f.staffIds.includes(m.id)}
                  onChange={() => setF({ ...f, staffIds: f.staffIds.includes(m.id) ? f.staffIds.filter((x) => x !== m.id) : [...f.staffIds, m.id] })}
                />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-violet" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} />
          Bookable online
        </label>
        {error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          {service ? (
            <Button type="button" variant="danger" onClick={archive}>
              Archive
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
