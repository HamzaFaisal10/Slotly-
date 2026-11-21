import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { SlotlyDB } from "@/lib/db";
import { resetDemo } from "@/lib/store";
import { availableSlots } from "@/lib/slots";
import { addDaysKey, todayKey, weekdayOf } from "@/lib/time";
import {
  BookingError,
  cancelBooking,
  confirmBooking,
  expireHolds,
  holdSlot,
  rescheduleBooking,
} from "@/lib/bookings";

const TZ = "Europe/London";
let db: SlotlyDB;
let n = 0;

const customer = { name: "Test Person", email: "test@example.com", phone: "+44 7700 900123" };

async function freeSlot(serviceId: string, offsetDays = 4) {
  const business = (await db.businesses.toArray())[0];
  let date = addDaysKey(todayKey(TZ), offsetDays);
  while (weekdayOf(date) === 1 || business.closedDates.some((c) => c.date === date)) date = addDaysKey(date, 1);
  const slots = availableSlots({
    business,
    service: (await db.services.get(serviceId))!,
    staff: await db.staff.toArray(),
    date,
    bookings: await db.bookings.toArray(),
    timeOff: await db.timeOff.toArray(),
  });
  return { business, slot: slots[0] };
}

beforeEach(async () => {
  db = new SlotlyDB(`bookings-test-${n++}`);
  await resetDemo(db, TZ);
});

describe("booking operations", () => {
  it("never lets two people take the same slot at once", async () => {
    const { business, slot } = await freeSlot("svc_facial");
    const input = { businessId: business.id, serviceId: "svc_facial", staffId: slot.staffIds[0], startsAt: slot.start };
    const results = await Promise.allSettled([holdSlot(input, db), holdSlot(input, db)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as BookingError).code).toBe("slot_taken");
  });

  it("confirms a paid hold and emails the customer and the staff member", async () => {
    const { business, slot } = await freeSlot("svc_wcut");
    const held = await holdSlot({ businessId: business.id, serviceId: "svc_wcut", staffId: "any", startsAt: slot.start }, db);
    expect(held.status).toBe("held");
    const done = await confirmBooking(held.id, customer, { cardLast4: "4242" }, db);
    expect(done.status).toBe("confirmed");
    expect(done.paidCents).toBe(2000);
    const emails = await db.emails.where("bookingId").equals(held.id).toArray();
    expect(emails.map((e) => e.kind).sort()).toEqual(["confirmation", "staff_new_booking"]);
    // A repeated confirmation (like a duplicate webhook) changes nothing.
    await confirmBooking(held.id, customer, { cardLast4: "4242" }, db);
    expect(await db.payments.where("bookingId").equals(held.id).count()).toBe(1);
  });

  it("releases an unpaid hold after 10 minutes", async () => {
    const { business, slot } = await freeSlot("svc_mcut");
    const now = Date.now();
    const held = await holdSlot({ businessId: business.id, serviceId: "svc_mcut", staffId: "any", startsAt: slot.start, now }, db);
    expect(await expireHolds(db, now + 11 * 60000)).toBe(1);
    expect((await db.bookings.get(held.id))!.status).toBe("expired");
    await expect(confirmBooking(held.id, customer, null, db, now + 11 * 60000)).rejects.toMatchObject({ code: "hold_expired" });
  });

  it("reschedules and frees the old time", async () => {
    const { business, slot } = await freeSlot("svc_mcut");
    const held = await holdSlot({ businessId: business.id, serviceId: "svc_mcut", staffId: "any", startsAt: slot.start }, db);
    const booked = await confirmBooking(held.id, customer, null, db);
    const { slot: later } = await freeSlot("svc_mcut", 6);
    const moved = await rescheduleBooking(booked.code, later.start, "any", "customer", db);
    expect(moved.code).toBe(booked.code);
    expect(moved.startsAt).toBe(later.start);
    const again = await holdSlot({ businessId: business.id, serviceId: "svc_mcut", staffId: booked.staffId, startsAt: slot.start }, db);
    expect(again.status).toBe("held");
  });

  it("refunds a cancellation outside 24 hours, keeps the deposit inside it", async () => {
    const { business, slot } = await freeSlot("svc_wcut");
    const held = await holdSlot({ businessId: business.id, serviceId: "svc_wcut", staffId: "any", startsAt: slot.start }, db);
    const b = await confirmBooking(held.id, customer, { cardLast4: "4242" }, db);
    const late = await cancelBooking(b.code, "customer", "", db, b.startsAt - 3 * 3600000);
    expect(late.refundCents).toBe(0);
    expect(late.keptCents).toBe(2000);

    const { slot: s2 } = await freeSlot("svc_wcut", 5);
    const h2 = await holdSlot({ businessId: business.id, serviceId: "svc_wcut", staffId: "any", startsAt: s2.start }, db);
    const b2 = await confirmBooking(h2.id, customer, { cardLast4: "4242" }, db);
    const early = await cancelBooking(b2.code, "customer", "Plans changed", db);
    expect(early.refundCents).toBe(2000);
  });
});
