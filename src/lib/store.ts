import { getDb, type SlotlyDB } from "./db";
import { buildSeed, DEMO_SLUG } from "./seed";
import { browserTimeZone } from "./time";

const SEED_VERSION = "1";

/** Load the demo business into this browser the first time (or after a reset). */
export async function ensureSeeded(db: SlotlyDB = getDb(), timeZone = browserTimeZone()) {
  const v = await db.meta.get("seedVersion");
  if (v?.value === SEED_VERSION && (await db.businesses.where("slug").equals(DEMO_SLUG).count())) return;
  await resetDemo(db, timeZone);
}

export async function resetDemo(db: SlotlyDB = getDb(), timeZone = browserTimeZone()) {
  const seed = buildSeed(timeZone);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.businesses.add(seed.business);
    await db.categories.bulkAdd(seed.categories);
    await db.services.bulkAdd(seed.services);
    await db.addons.bulkAdd(seed.addons);
    await db.staff.bulkAdd(seed.staff);
    await db.timeOff.bulkAdd(seed.timeOff);
    await db.customers.bulkAdd(seed.customers);
    await db.bookings.bulkAdd(seed.bookings);
    await db.payments.bulkAdd(seed.payments);
    await db.activity.bulkAdd(seed.activity);
    await db.meta.put({ key: "seedVersion", value: SEED_VERSION });
    await db.meta.put({ key: "seededAt", value: String(Date.now()) });
  });
}
