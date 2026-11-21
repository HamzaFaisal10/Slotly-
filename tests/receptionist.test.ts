import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { SlotlyDB } from "@/lib/db";
import { resetDemo } from "@/lib/store";
import { send, startConversation } from "@/lib/receptionist/receptionist";
import { understand } from "@/lib/receptionist/understand";
import { buildSeed } from "@/lib/seed";

const TZ = "America/New_York";
let db: SlotlyDB;
let n = 0;

beforeEach(async () => {
  db = new SlotlyDB(`receptionist-${n++}`);
  await resetDemo(db, TZ);
});

const say = async (id: string, text: string) => (await send(id, text, db)).map((r) => r.text).join(" ");

describe("understanding messages", () => {
  const seed = buildSeed(TZ);
  const ctx = { services: seed.services, staff: seed.staff, today: "2026-11-19" }; // a Thursday

  it("reads service, person, day and part of day", () => {
    const u = understand("Can I get a balayage with Ava on Saturday afternoon?", ctx);
    expect(u).toMatchObject({ intent: "book", serviceId: "svc_balayage", staffId: "stf_ava", date: "2026-11-21", partOfDay: "afternoon" });
  });

  it("reads spoken times and dates", () => {
    expect(understand("tomorrow at two thirty pm", ctx)).toMatchObject({ date: "2026-11-20", time: 14 * 60 + 30 });
    expect(understand("the 28th at 3", ctx)).toMatchObject({ date: "2026-11-28", time: 15 * 60 });
    expect(understand("next friday 10am", ctx)).toMatchObject({ date: "2026-11-20", time: 600 });
  });

  it("asks which cut when it's not clear", () => {
    expect(understand("I need a haircut", ctx).ambiguousCut).toBe(true);
  });

  it("spots cancel, reschedule and a booking number", () => {
    expect(understand("please cancel SL-ab12cd", ctx)).toMatchObject({ intent: "cancel", code: "SL-AB12CD" });
    expect(understand("can I move my appointment?", ctx).intent).toBe("reschedule");
  });
});

describe("receptionist conversations", () => {
  it("books a no-deposit service end to end", async () => {
    const c = await startConversation("biz_lumen", "chat", db);
    const offer = await send(c.id, "I'd like a men's cut on Thursday", db);
    expect(offer[0].text).toMatch(/I have/);
    const slot = offer[0].choices!.find((x) => x.value.startsWith("@slot:"))!;
    expect(await say(c.id, slot.value)).toMatch(/held .* What's your full name/);
    expect(await say(c.id, "Sam Rivers")).toMatch(/email/);
    expect(await say(c.id, "sam@example.com")).toMatch(/phone/);
    const done = await say(c.id, "+1 555 222 3333");
    expect(done).toMatch(/You're booked, Sam!/);
    const conv = await db.conversations.get(c.id);
    const booking = await db.bookings.get(conv!.bookingId!);
    expect(booking).toMatchObject({ status: "confirmed", source: "ai" });
    const msgs = await db.messages.where("conversationId").equals(c.id).toArray();
    expect(msgs.some((m) => m.actions?.some((a) => a.startsWith("confirm_booking")))).toBe(true);
  });

  it("sends a payment link when a deposit is needed", async () => {
    const c = await startConversation("biz_lumen", "chat", db);
    const offer = await send(c.id, "balayage please", db);
    await send(c.id, offer[0].choices![0].value, db);
    await send(c.id, "Jo Lane", db);
    await send(c.id, "jo@example.com", db);
    const [r] = await send(c.id, "555 444 1234", db);
    expect(r.link?.href).toContain("/b/lumen-studio/book?");
    expect(r.link?.label).toMatch(/Pay \$78 deposit/);
  });

  it("verifies by email code before cancelling", async () => {
    const c = await startConversation("biz_lumen", "chat", db);
    const offer = await send(c.id, "men's cut next week", db);
    await send(c.id, offer[0].choices![0].value, db);
    await send(c.id, "Pat Doe", db);
    await send(c.id, "pat@example.com", db);
    await send(c.id, "555 444 9876", db);
    const code = (await db.bookings.get((await db.conversations.get(c.id))!.bookingId!))!.code;

    const c2 = await startConversation("biz_lumen", "chat", db);
    expect(await say(c2.id, `I need to cancel ${code}`)).toMatch(/What email/);
    expect(await say(c2.id, "wrong@example.com")).toMatch(/doesn't match/);
    expect(await say(c2.id, "pat@example.com")).toMatch(/6-digit code/);
    const email = (await db.emails.toArray()).filter((e) => e.kind === "verify_code").at(-1);
    const otp = email!.subject.match(/\d{6}/)![0];
    expect(await say(c2.id, "000000")).toMatch(/doesn't match/);
    expect(await say(c2.id, otp)).toMatch(/Shall I cancel it/);
    expect(await say(c2.id, "yes")).toMatch(/Cancelled/);
    expect((await db.bookings.where("code").equals(code).first())!.status).toBe("cancelled");
  });

  it("answers prices and hands off to a person", async () => {
    const c = await startConversation("biz_lumen", "chat", db);
    expect(await say(c.id, "how much is a gel manicure?")).toMatch(/\$50/);
    expect(await say(c.id, "can I talk to a real person")).toMatch(/passed this to the team/);
    expect((await db.conversations.get(c.id))!.needsHuman).toBe(true);
  });
});
