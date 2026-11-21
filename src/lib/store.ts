import { getDb, type SlotlyDB } from "./db";
import { buildSeed, DEMO_BUSINESS_ID, DEMO_SLUG } from "./seed";
import { browserTimeZone } from "./time";

const SEED_VERSION = "4";

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
  await seedConversations(db).catch(() => {});
  // Seeding sends demo emails (confirmations, handoff); start the inbox clean.
  await db.emails.clear();
}

/** A few real receptionist conversations, so the Conversations page isn't empty. */
async function seedConversations(db: SlotlyDB) {
  const { send, startConversation } = await import("./receptionist/receptionist");
  const say = async (id: string, lines: string[]) => {
    for (const l of lines) await send(id, l, db);
  };

  const booked = await startConversation(DEMO_BUSINESS_ID, "chat", db);
  const replies = await send(booked.id, "Hi, can I get a men's cut later this week in the afternoon?", db);
  const slot = replies.flatMap((r) => r.choices ?? []).find((c) => c.value.startsWith("@slot:"));
  if (slot) await say(booked.id, [slot.value, "Daniel Reyes", "daniel.reyes@example.com", "+1 555 310 4471", "thanks!"]);

  const call = await startConversation(DEMO_BUSINESS_ID, "voice", db);
  await say(call.id, ["What time are you open on Sunday?", "and how much is a balayage", "great thank you"]);

  const human = await startConversation(DEMO_BUSINESS_ID, "chat", db);
  await say(human.id, ["Do you do bridal hair for a wedding party of six?", "Yes, talk to a person please"]);
}
