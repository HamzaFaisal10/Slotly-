import { bookingCode, getDb, uid, type SlotlyDB } from "./db";
import { availableSlots, isBlocking, serviceMinutes } from "./slots";
import { buildEmail } from "./email";
import { depositFor, fmtMoney } from "./money";
import { dateKey } from "./time";
import type { Booking, BookingSource, Customer, DemoEmail } from "./types";

/**
 * Booking operations. Each one runs in a single read-write IndexedDB
 * transaction, which the browser serialises across tabs, so two people
 * pressing "Book" at the same moment cannot both win (in production this is
 * a Postgres exclusion constraint on staff + time range).
 */

export type BookingErrorCode =
  | "slot_taken"
  | "hold_expired"
  | "not_found"
  | "not_allowed"
  | "invalid";

export class BookingError extends Error {
  constructor(
    public code: BookingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const TABLES = (db: SlotlyDB) => [
  db.businesses,
  db.services,
  db.addons,
  db.staff,
  db.timeOff,
  db.bookings,
  db.customers,
  db.payments,
  db.activity,
  db.emails,
];

export interface HoldInput {
  businessId: string;
  serviceId: string;
  addonIds?: string[];
  staffId: string | "any";
  startsAt: number;
  source?: BookingSource;
  now?: number;
}

async function loadContext(db: SlotlyDB, businessId: string, serviceId: string, addonIds: string[]) {
  const business = await db.businesses.get(businessId);
  const service = await db.services.get(serviceId);
  if (!business || !service || service.archivedAt) throw new BookingError("invalid", "That service is not available.");
  const addons = (await db.addons.bulkGet(addonIds)).filter(
    (a): a is NonNullable<typeof a> => !!a && a.serviceId === serviceId,
  );
  const staff = await db.staff.where("businessId").equals(businessId).toArray();
  return { business, service, addons, staff };
}

async function freeStaffAt(
  db: SlotlyDB,
  ctx: Awaited<ReturnType<typeof loadContext>>,
  startsAt: number,
  now: number,
  excludeBookingId?: string,
) {
  const date = dateKey(startsAt, ctx.business.timeZone);
  const dayStart = startsAt - 36 * 3600000;
  const dayEnd = startsAt + 36 * 3600000;
  const bookings = await db.bookings.where("startsAt").between(dayStart, dayEnd).toArray();
  const timeOff = await db.timeOff.toArray();
  const slots = availableSlots({
    business: ctx.business,
    service: ctx.service,
    addons: ctx.addons,
    staff: ctx.staff,
    date,
    bookings,
    timeOff,
    now,
    excludeBookingId,
  });
  return slots.find((s) => s.start === startsAt)?.staffIds ?? [];
}

/** Hold a slot for the business's hold time while the customer pays. */
export async function holdSlot(input: HoldInput, db: SlotlyDB = getDb()): Promise<Booking> {
  const now = input.now ?? Date.now();
  const addonIds = input.addonIds ?? [];
  return db.transaction("rw", TABLES(db), async () => {
    const ctx = await loadContext(db, input.businessId, input.serviceId, addonIds);
    const free = await freeStaffAt(db, ctx, input.startsAt, now);
    const staffId = input.staffId === "any" ? free[0] : free.includes(input.staffId) ? input.staffId : undefined;
    if (!staffId) throw new BookingError("slot_taken", "That time was just taken. Please pick another.");

    const minutes = serviceMinutes(ctx.service, ctx.addons);
    const total = ctx.service.priceCents + ctx.addons.reduce((s, a) => s + a.priceCents, 0);
    const endsAt = input.startsAt + minutes * 60000;
    const booking: Booking = {
      id: uid("bkg"),
      code: bookingCode(),
      businessId: ctx.business.id,
      customerId: null,
      staffId,
      serviceId: ctx.service.id,
      addonIds: ctx.addons.map((a) => a.id),
      startsAt: input.startsAt,
      endsAt,
      blockStart: input.startsAt - ctx.service.bufferBeforeMin * 60000,
      blockEnd: endsAt + ctx.service.bufferAfterMin * 60000,
      status: "held",
      holdExpiresAt: now + ctx.business.rules.holdMin * 60000,
      totalCents: total,
      depositCents: depositFor(ctx.service, total),
      paidCents: 0,
      source: input.source ?? "web",
      note: "",
      cancelReason: "",
      createdAt: now,
      updatedAt: now,
    };

    // Final guard, like the database constraint: no overlap for this staff member.
    const clash = await db.bookings
      .where("staffId")
      .equals(staffId)
      .filter((b) => isBlocking(b, now) && b.blockStart < booking.blockEnd && booking.blockStart < b.blockEnd)
      .count();
    if (clash) throw new BookingError("slot_taken", "That time was just taken. Please pick another.");

    await db.bookings.add(booking);
    await log(db, booking, "customer", "held", "");
    return booking;
  });
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  note?: string;
}

export function validateCustomer(d: CustomerDetails): string | null {
  if (d.name.trim().length < 2) return "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return "Enter a valid email address.";
  if (d.phone.replace(/\D/g, "").length < 7) return "Enter a valid phone number.";
  return null;
}

/**
 * Confirm a held booking. In production Stripe's webhook calls this after the
 * deposit is paid; in the demo the demo checkout calls it.
 */
export async function confirmBooking(
  bookingId: string,
  details: CustomerDetails,
  payment: { cardLast4: string } | null,
  db: SlotlyDB = getDb(),
  now = Date.now(),
): Promise<Booking> {
  const problem = validateCustomer(details);
  if (problem) throw new BookingError("invalid", problem);
  return db.transaction("rw", TABLES(db), async () => {
    const booking = await db.bookings.get(bookingId);
    if (!booking) throw new BookingError("not_found", "Booking not found.");
    if (booking.status === "confirmed") return booking; // idempotent, like a repeated webhook
    if (booking.status !== "held" || (booking.holdExpiresAt ?? 0) <= now)
      throw new BookingError("hold_expired", "Your 10-minute hold ran out and the time was released.");
    if (booking.depositCents > 0 && !payment) throw new BookingError("invalid", "A deposit is needed for this service.");

    const customer = await upsertCustomer(db, booking.businessId, details, now);
    const updated: Booking = {
      ...booking,
      customerId: customer.id,
      status: "confirmed",
      holdExpiresAt: null,
      paidCents: booking.depositCents,
      note: details.note?.trim() ?? "",
      updatedAt: now,
    };
    await db.bookings.put(updated);
    if (booking.depositCents > 0 && payment) {
      await db.payments.add({
        id: uid("pay"),
        businessId: booking.businessId,
        bookingId: booking.id,
        amountCents: booking.depositCents,
        kind: "deposit",
        status: "succeeded",
        cardLast4: payment.cardLast4,
        createdAt: now,
      });
    }
    await log(db, updated, "customer", "confirmed", booking.depositCents ? `Deposit paid` : "");
    await notify(db, updated, ["confirmation", "staff_new_booking"]);
    return updated;
  });
}

async function upsertCustomer(db: SlotlyDB, businessId: string, d: CustomerDetails, now: number): Promise<Customer> {
  const email = d.email.trim().toLowerCase();
  const existing = await db.customers
    .where("email")
    .equals(email)
    .filter((c) => c.businessId === businessId)
    .first();
  if (existing) {
    const next = { ...existing, name: d.name.trim(), phone: d.phone.trim() };
    await db.customers.put(next);
    return next;
  }
  const c: Customer = {
    id: uid("cus"),
    businessId,
    name: d.name.trim(),
    email,
    phone: d.phone.trim(),
    notes: "",
    noShowCount: 0,
    createdAt: now,
  };
  await db.customers.add(c);
  return c;
}

/** Release holds that were not paid in time. Runs every few seconds in the app. */
export async function expireHolds(db: SlotlyDB = getDb(), now = Date.now()): Promise<number> {
  return db.transaction("rw", TABLES(db), async () => {
    const stale = await db.bookings
      .where("status")
      .equals("held")
      .filter((b) => (b.holdExpiresAt ?? 0) <= now)
      .toArray();
    for (const b of stale) {
      const next = { ...b, status: "expired" as const, updatedAt: now };
      await db.bookings.put(next);
      await log(db, next, "system", "hold_expired", "");
    }
    return stale.length;
  });
}

export async function findBooking(code: string, db: SlotlyDB = getDb()) {
  return db.bookings.where("code").equals(code.trim().toUpperCase()).first();
}

/** Move a booking to another free time. Keeps the booking number and the deposit. */
export async function rescheduleBooking(
  code: string,
  startsAt: number,
  staffId: string | "any",
  actor: "customer" | "business" | "ai",
  db: SlotlyDB = getDb(),
  now = Date.now(),
): Promise<Booking> {
  return db.transaction("rw", TABLES(db), async () => {
    const booking = await findBooking(code, db);
    if (!booking) throw new BookingError("not_found", "Booking not found.");
    if (!["confirmed", "held"].includes(booking.status))
      throw new BookingError("not_allowed", "This booking can no longer be changed.");
    if (actor !== "business" && booking.startsAt < now)
      throw new BookingError("not_allowed", "This appointment has already started.");

    const ctx = await loadContext(db, booking.businessId, booking.serviceId, booking.addonIds);
    // The salon itself may move a booking up to "now"; customers keep the minimum notice.
    const checkNow = actor === "business" ? now - ctx.business.rules.minNoticeMin * 60000 : now;
    const free = await freeStaffAt(db, ctx, startsAt, checkNow, booking.id);
    const preferred = staffId === "any" ? (free.includes(booking.staffId) ? booking.staffId : free[0]) : staffId;
    if (!preferred || !free.includes(preferred))
      throw new BookingError("slot_taken", "That time was just taken. Please pick another.");

    const dur = booking.endsAt - booking.startsAt;
    const next: Booking = {
      ...booking,
      staffId: preferred,
      startsAt,
      endsAt: startsAt + dur,
      blockStart: startsAt - ctx.service.bufferBeforeMin * 60000,
      blockEnd: startsAt + dur + ctx.service.bufferAfterMin * 60000,
      updatedAt: now,
    };
    await db.bookings.put(next);
    await log(db, next, actor, "rescheduled", `from ${new Date(booking.startsAt).toISOString()}`);
    await notify(db, next, ["rescheduled", "staff_change"], `Moved to a new time by the ${actor}.`);
    return next;
  });
}

export interface CancelOutcome {
  booking: Booking;
  refundCents: number;
  keptCents: number;
}

/** What cancelling now would refund, under the business's policy. */
export function cancelTerms(booking: Booking, freeCancelHours: number, by: "customer" | "business", now = Date.now()) {
  const free = by === "business" || booking.startsAt - now >= freeCancelHours * 3600000;
  const refundCents = free ? booking.paidCents : Math.max(0, booking.paidCents - booking.depositCents);
  return { free, refundCents, keptCents: booking.paidCents - refundCents };
}

export async function cancelBooking(
  code: string,
  by: "customer" | "business",
  reason: string,
  db: SlotlyDB = getDb(),
  now = Date.now(),
): Promise<CancelOutcome> {
  return db.transaction("rw", TABLES(db), async () => {
    const booking = await findBooking(code, db);
    if (!booking) throw new BookingError("not_found", "Booking not found.");
    if (!["confirmed", "held", "arrived"].includes(booking.status))
      throw new BookingError("not_allowed", "This booking is already closed.");
    const business = (await db.businesses.get(booking.businessId))!;
    const terms = cancelTerms(booking, business.policy.freeCancelHours, by, now);

    const next: Booking = {
      ...booking,
      status: "cancelled",
      holdExpiresAt: null,
      paidCents: booking.paidCents - terms.refundCents,
      cancelReason: reason.trim() || (by === "business" ? "Cancelled by the business" : "Cancelled by the customer"),
      updatedAt: now,
    };
    await db.bookings.put(next);
    if (terms.refundCents > 0) {
      await db.payments.add({
        id: uid("pay"),
        businessId: booking.businessId,
        bookingId: booking.id,
        amountCents: -terms.refundCents,
        kind: "refund",
        status: "succeeded",
        cardLast4: "4242",
        createdAt: now,
      });
    }
    await log(db, next, by, "cancelled", next.cancelReason);
    const money =
      terms.refundCents > 0
        ? `Refund of ${fmtMoney(terms.refundCents, business.currency)} is on its way to your card.`
        : terms.keptCents > 0
          ? `The deposit of ${fmtMoney(terms.keptCents, business.currency)} is kept under the cancellation policy.`
          : "";
    if (booking.customerId) await notify(db, next, ["cancelled", "staff_change"], money);
    return { booking: next, ...terms };
  });
}

export interface ManualBookingInput {
  businessId: string;
  serviceId: string;
  staffId: string;
  startsAt: number;
  customer: { name: string; phone: string; email?: string };
  note?: string;
}

/** A phone or walk-in booking made by the front desk. Paid at the visit, no deposit. */
export async function createManualBooking(input: ManualBookingInput, db: SlotlyDB = getDb(), now = Date.now()): Promise<Booking> {
  if (input.customer.name.trim().length < 2) throw new BookingError("invalid", "Enter the customer's name.");
  if (input.customer.phone.replace(/\D/g, "").length < 7) throw new BookingError("invalid", "Enter a phone number.");
  const email = input.customer.email?.trim().toLowerCase() ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError("invalid", "That email doesn't look right.");
  return db.transaction("rw", TABLES(db), async () => {
    const ctx = await loadContext(db, input.businessId, input.serviceId, []);
    const free = await freeStaffAt(db, ctx, input.startsAt, now - ctx.business.rules.minNoticeMin * 60000);
    if (!free.includes(input.staffId))
      throw new BookingError("slot_taken", "That person isn't free for this service at that time.");
    const customer = email
      ? await upsertCustomer(db, input.businessId, { name: input.customer.name, email, phone: input.customer.phone }, now)
      : ({
          id: uid("cus"),
          businessId: input.businessId,
          name: input.customer.name.trim(),
          email: "",
          phone: input.customer.phone.trim(),
          notes: "",
          noShowCount: 0,
          createdAt: now,
        } satisfies Customer);
    if (!email) await db.customers.add(customer);
    const endsAt = input.startsAt + ctx.service.durationMin * 60000;
    const booking: Booking = {
      id: uid("bkg"),
      code: bookingCode(),
      businessId: input.businessId,
      customerId: customer.id,
      staffId: input.staffId,
      serviceId: input.serviceId,
      addonIds: [],
      startsAt: input.startsAt,
      endsAt,
      blockStart: input.startsAt - ctx.service.bufferBeforeMin * 60000,
      blockEnd: endsAt + ctx.service.bufferAfterMin * 60000,
      status: "confirmed",
      holdExpiresAt: null,
      totalCents: ctx.service.priceCents,
      depositCents: 0,
      paidCents: 0,
      source: "manual",
      note: input.note?.trim() ?? "",
      cancelReason: "",
      createdAt: now,
      updatedAt: now,
    };
    await db.bookings.add(booking);
    await log(db, booking, "front desk", "booked", "Phone or walk-in");
    await notify(db, booking, email ? ["confirmation", "staff_new_booking"] : ["staff_new_booking"]);
    return booking;
  });
}

/** Front-desk status changes: checked in, done (balance paid) or no-show. */
export async function setVisitStatus(
  code: string,
  status: "arrived" | "completed" | "no_show",
  actor = "staff",
  db: SlotlyDB = getDb(),
  now = Date.now(),
): Promise<Booking> {
  return db.transaction("rw", TABLES(db), async () => {
    const booking = await findBooking(code, db);
    if (!booking) throw new BookingError("not_found", "Booking not found.");
    const allowed: Record<string, string[]> = {
      arrived: ["confirmed"],
      completed: ["confirmed", "arrived"],
      no_show: ["confirmed"],
    };
    if (!allowed[status].includes(booking.status))
      throw new BookingError("not_allowed", `Can't mark a ${booking.status.replace("_", " ")} booking as ${status.replace("_", " ")}.`);
    if (status === "no_show" && booking.startsAt > now)
      throw new BookingError("not_allowed", "A booking can be marked as a no-show only after its start time.");

    const next: Booking = { ...booking, status, updatedAt: now };
    if (status === "completed") {
      const balance = booking.totalCents - booking.paidCents;
      if (balance > 0) {
        await db.payments.add({
          id: uid("pay"),
          businessId: booking.businessId,
          bookingId: booking.id,
          amountCents: balance,
          kind: "balance",
          status: "succeeded",
          cardLast4: "4242",
          createdAt: now,
        });
      }
      next.paidCents = booking.totalCents;
    }
    if (status === "no_show" && booking.customerId) {
      const c = await db.customers.get(booking.customerId);
      if (c) await db.customers.update(c.id, { noShowCount: c.noShowCount + 1 });
    }
    await db.bookings.put(next);
    await log(db, next, actor, status, "");
    return next;
  });
}

async function log(db: SlotlyDB, b: Booking, actor: string, action: string, meta: string) {
  await db.activity.add({ id: uid("act"), businessId: b.businessId, bookingId: b.id, actor, action, meta, at: Date.now() });
}

async function notify(db: SlotlyDB, b: Booking, kinds: DemoEmail["kind"][], extra?: string) {
  const business = await db.businesses.get(b.businessId);
  const service = await db.services.get(b.serviceId);
  const staff = await db.staff.get(b.staffId);
  const customer = b.customerId ? await db.customers.get(b.customerId) : null;
  if (!business || !service || !staff) return;
  for (const kind of kinds) {
    await db.emails.add(buildEmail(kind, { business, booking: b, service, staff, customer, extra }));
  }
}
