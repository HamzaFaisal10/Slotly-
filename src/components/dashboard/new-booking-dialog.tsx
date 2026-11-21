"use client";

import { useState } from "react";
import { BookingError, createManualBooking } from "@/lib/bookings";
import { fmtDuration, fmtMoney } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/time";
import { Avatar, Button, Field, inputClass } from "@/components/ui";
import type { Business, Service, Staff } from "@/lib/types";

/** Phone or walk-in booking from an empty spot on the calendar. */
export function NewBookingDialog({
  business,
  staff,
  services,
  startsAt,
  onClose,
  onDone,
}: {
  business: Business;
  staff: Staff;
  services: Service[];
  startsAt: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const options = services.filter((s) => staff.serviceIds.includes(s.id) && !s.archivedAt);
  const [serviceId, setServiceId] = useState(options[0]?.id ?? "");
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tz = business.timeZone;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const b = await createManualBooking({
        businessId: business.id,
        serviceId,
        staffId: staff.id,
        startsAt,
        customer: { name: form.name, phone: form.phone, email: form.email },
        note: form.note,
      });
      onDone(`Booked ${form.name.split(" ")[0]} at ${fmtTime(b.startsAt, tz)} (${b.code}).`);
    } catch (err) {
      setError(err instanceof BookingError ? err.message : "Couldn't save the booking.");
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
        aria-label="New booking"
        noValidate
      >
        <div className="flex items-center gap-3">
          <Avatar name={staff.name} color={staff.color} size={40} />
          <div>
            <h2 className="font-display text-xl font-semibold">New booking</h2>
            <p className="text-sm text-ink-2">
              {staff.name}, {fmtDate(startsAt, tz, "EEE d MMM")} at {fmtTime(startsAt, tz)}
            </p>
          </div>
        </div>
        <Field label="Service">
          <select className={inputClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {fmtDuration(s.durationMin)}, {fmtMoney(s.priceCents, business.currency)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name">
            <input className={inputClass} value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
        </div>
        <Field label="Email (optional)" hint="Add it to send a confirmation.">
          <input className={inputClass} value={form.email} onChange={set("email")} type="email" />
        </Field>
        <p className="rounded-xl bg-mist px-3 py-2 text-sm text-ink-2">Paid at the visit. No deposit for front-desk bookings.</p>
        {error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !serviceId}>
            Save booking
          </Button>
        </div>
      </form>
    </div>
  );
}
