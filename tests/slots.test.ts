import { describe, expect, it } from "vitest";
import { availableSlots } from "@/lib/slots";
import { buildSeed } from "@/lib/seed";
import { zonedToUtc, fmtTime } from "@/lib/time";
import type { Booking } from "@/lib/types";

const TZ = "America/New_York";
// Thursday 22 Oct 2026, 08:00 New York time
const NOW = zonedToUtc("2026-10-22", "08:00", TZ);
const seed = buildSeed(TZ, NOW);
const { business, staff } = seed;
const svc = (id: string) => seed.services.find((s) => s.id === id)!;
const sara = staff.filter((s) => s.id === "stf_sara");

const times = (slots: { start: number }[]) => slots.map((s) => fmtTime(s.start, TZ));

function booking(staffId: string, date: string, from: string, to: string, extra: Partial<Booking> = {}): Booking {
  const start = zonedToUtc(date, from, TZ);
  const end = zonedToUtc(date, to, TZ);
  return {
    id: "b" + from,
    code: "SL-T" + from,
    businessId: business.id,
    customerId: null,
    staffId,
    serviceId: "svc_mcut",
    addonIds: [],
    startsAt: start,
    endsAt: end,
    blockStart: start,
    blockEnd: end + 10 * 60000,
    status: "confirmed",
    holdExpiresAt: null,
    totalCents: 0,
    depositCents: 0,
    paidCents: 0,
    source: "web",
    note: "",
    cancelReason: "",
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

const base = { business, staff: sara, bookings: [] as Booking[], timeOff: [], now: NOW };

describe("slot engine", () => {
  it("starts at opening and steps every 15 minutes", () => {
    const slots = availableSlots({ ...base, service: svc("svc_mcut"), date: "2026-10-23" });
    expect(times(slots).slice(0, 3)).toEqual(["9:00 AM", "9:15 AM", "9:30 AM"]);
  });

  it("keeps the whole service inside working hours", () => {
    const slots = availableSlots({ ...base, service: svc("svc_wcut"), date: "2026-10-23" });
    // Sara works until 17:00; a 60-minute cut must start by 16:00.
    expect(times(slots).at(-1)).toBe("4:00 PM");
  });

  it("removes the lunch break", () => {
    const slots = availableSlots({ ...base, service: svc("svc_mcut"), date: "2026-10-23" });
    const t = times(slots);
    expect(t).not.toContain("12:45 PM"); // 12:45 + 30 min + 10 min buffer runs into 13:00
    expect(t).not.toContain("1:00 PM");
    expect(t).toContain("1:45 PM");
  });

  it("removes existing bookings, widened by buffers", () => {
    const b = booking("stf_sara", "2026-10-23", "10:00", "10:30");
    const t = times(availableSlots({ ...base, bookings: [b], service: svc("svc_mcut"), date: "2026-10-23" }));
    expect(t).not.toContain("9:30 AM"); // 9:30–10:00 + 10 min buffer overlaps 10:00
    expect(t).not.toContain("10:30 AM"); // booking's own 10 min buffer
    expect(t).toContain("10:45 AM");
  });

  it("ignores expired holds but respects live ones", () => {
    const live = booking("stf_sara", "2026-10-23", "11:00", "11:30", { status: "held", holdExpiresAt: NOW + 60000 });
    const dead = booking("stf_sara", "2026-10-23", "14:00", "14:30", { status: "held", holdExpiresAt: NOW - 1 });
    const t = times(availableSlots({ ...base, bookings: [live, dead], service: svc("svc_mcut"), date: "2026-10-23" }));
    expect(t).not.toContain("11:00 AM");
    expect(t).toContain("2:00 PM");
  });

  it("removes time off", () => {
    const off = [{ id: "o", staffId: "stf_sara", startsAt: zonedToUtc("2026-10-23", "09:00", TZ), endsAt: zonedToUtc("2026-10-23", "12:00", TZ), reason: "" }];
    const t = times(availableSlots({ ...base, timeOff: off, service: svc("svc_mcut"), date: "2026-10-23" }));
    expect(t[0]).toBe("12:00 PM");
  });

  it("respects the minimum notice", () => {
    const now = zonedToUtc("2026-10-23", "10:05", TZ);
    const t = times(availableSlots({ ...base, now, service: svc("svc_mcut"), date: "2026-10-23" }));
    expect(t[0]).toBe("12:15 PM"); // 2 hours of notice, then the next 15-minute step
  });

  it("is closed on Mondays and on holidays", () => {
    expect(availableSlots({ ...base, service: svc("svc_mcut"), date: "2026-10-26" })).toEqual([]);
    const holiday = business.closedDates[0].date;
    expect(availableSlots({ ...base, staff, service: svc("svc_mcut"), date: holiday })).toEqual([]);
  });

  it("handles the daylight-saving change (1 Nov 2026 in New York)", () => {
    const slots = availableSlots({ ...base, staff, service: svc("svc_blow"), date: "2026-11-01" }); // Ava works Sundays from 9
    expect(times(slots)[0]).toBe("9:00 AM");
    // 9:00 EST is 14:00 UTC after the clocks go back
    expect(new Date(slots[0].start).toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("lists every free staff member for 'Any available'", () => {
    const t = availableSlots({ ...base, staff, service: svc("svc_mcut"), date: "2026-10-23" });
    const noon = t.find((s) => fmtTime(s.start, TZ) === "12:00 PM")!;
    expect(noon.staffIds.sort()).toEqual(["stf_leo", "stf_sara"]);
  });
});
