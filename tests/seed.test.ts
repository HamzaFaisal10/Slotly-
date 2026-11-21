import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed";
import { SlotlyDB } from "@/lib/db";
import { ensureSeeded } from "@/lib/store";
import { BLOCKING_STATUSES } from "@/lib/types";

describe("demo seed", () => {
  const seed = buildSeed("America/New_York");

  it("has the demo business with 4 staff and 10 services", () => {
    expect(seed.business.slug).toBe("lumen-studio");
    expect(seed.staff).toHaveLength(4);
    expect(seed.services).toHaveLength(10);
    expect(seed.customers).toHaveLength(60);
  });

  it("has a lived-in calendar of bookings", () => {
    expect(seed.bookings.length).toBeGreaterThan(80);
    expect(seed.bookings.some((b) => b.status === "cancelled")).toBe(true);
    expect(seed.bookings.some((b) => b.status === "no_show")).toBe(true);
    expect(seed.bookings.some((b) => b.status === "confirmed" && b.startsAt > Date.now())).toBe(true);
  });

  it("never double-books a staff member", () => {
    const active = seed.bookings.filter((b) => BLOCKING_STATUSES.includes(b.status));
    for (const a of active)
      for (const b of active)
        if (a !== b && a.staffId === b.staffId)
          expect(a.blockStart < b.blockEnd && b.blockStart < a.blockEnd).toBe(false);
  });

  it("loads into IndexedDB once", async () => {
    const db = new SlotlyDB("seed-test");
    await ensureSeeded(db, "Europe/London");
    const count = await db.bookings.count();
    await ensureSeeded(db, "Europe/London");
    expect(await db.bookings.count()).toBe(count);
    expect(await db.staff.count()).toBe(4);
  });
});
