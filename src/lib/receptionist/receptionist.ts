import { getDb, uid, type SlotlyDB } from "../db";
import { availableSlots, isClosed, type Slot } from "../slots";
import {
  BookingError,
  cancelBooking,
  cancelTerms,
  confirmBooking,
  findBooking,
  holdSlot,
  rescheduleBooking,
} from "../bookings";
import { buildEmail } from "../email";
import { depositFor, fmtDuration, fmtMoney } from "../money";
import { addDaysKey, clockToMin, fmtDate, fmtDateKey, fmtTime, minutesOfDay, todayKey, zoneLabel } from "../time";
import type { Business, Channel, ChatMessage, Choice, Conversation, Service, ServiceAddon, Staff } from "../types";
import { understand, type PartOfDay, type Understood } from "./understand";

/**
 * The AI receptionist. It answers from the business's own data and books
 * through the same functions as the booking page (find slots, hold, confirm,
 * reschedule, cancel), so it can never invent a slot or a price.
 *
 * Every tool call is recorded on the message, so the owner can see exactly
 * what it did. A production build can swap `understand()` for an LLM with
 * tool calling; the tools and rules below stay the same.
 */

type Stage =
  | "idle"
  | "need_service"
  | "choose_cut"
  | "choose_slot"
  | "need_name"
  | "need_email"
  | "need_phone"
  | "await_payment"
  | "manage_code"
  | "manage_email"
  | "manage_otp"
  | "manage_menu"
  | "confirm_cancel"
  | "reschedule_slot"
  | "done";

interface OfferedSlot {
  start: number;
  staffId: string;
}

interface State {
  stage: Stage;
  serviceId?: string;
  staffId?: string; // id or "any"
  date?: string;
  partOfDay?: PartOfDay;
  time?: number;
  offered?: OfferedSlot[];
  holdId?: string;
  name?: string;
  email?: string;
  phone?: string;
  manage?: { code: string; email?: string; otp?: string; verified?: boolean; after?: "cancel" | "reschedule" };
}

export interface Reply {
  text: string;
  choices?: Choice[];
  link?: { label: string; href: string };
}

interface Ctx {
  db: SlotlyDB;
  business: Business;
  services: Service[];
  addons: ServiceAddon[];
  staff: Staff[];
  channel: Channel;
  actions: string[];
  conversation: Conversation;
}

export const GREETING = (b: Business) =>
  `Hi, I'm the ${b.name} receptionist. I can book, move or cancel an appointment, or answer questions about services, prices and hours. What can I do for you?`;

export const STARTERS: Choice[] = [
  { label: "Book an appointment", value: "I'd like to book an appointment" },
  { label: "Prices", value: "What are your prices?" },
  { label: "Opening hours", value: "When are you open?" },
  { label: "Change my booking", value: "I want to reschedule my booking" },
];

export async function startConversation(businessId: string, channel: Channel, db: SlotlyDB = getDb()) {
  const business = (await db.businesses.get(businessId))!;
  const now = Date.now();
  const conversation: Conversation = {
    id: uid("cnv"),
    businessId,
    channel,
    startedAt: now,
    updatedAt: now,
    needsHuman: false,
    bookingId: null,
    customerName: "",
    state: JSON.stringify({ stage: "idle" } satisfies State),
  };
  await db.conversations.add(conversation);
  await db.messages.add({
    id: uid("msg"),
    conversationId: conversation.id,
    role: "assistant",
    text: GREETING(business),
    choices: channel === "chat" ? STARTERS : undefined,
    at: now,
  });
  return conversation;
}

/** Handle one customer message (typed, tapped or spoken) and store both sides. */
export async function send(conversationId: string, input: string, db: SlotlyDB = getDb()): Promise<Reply[]> {
  const conversation = await db.conversations.get(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const business = (await db.businesses.get(conversation.businessId))!;
  const [services, addons, staff] = await Promise.all([
    db.services.where("businessId").equals(business.id).filter((s) => !s.archivedAt && s.online).toArray(),
    db.addons.toArray(),
    db.staff.where("businessId").equals(business.id).filter((s) => s.active).toArray(),
  ]);
  const ctx: Ctx = { db, business, services, addons, staff, channel: conversation.channel, actions: [], conversation };
  const state = JSON.parse(conversation.state) as State;
  const now = Date.now();

  await db.messages.add({ id: uid("msg"), conversationId, role: "user", text: input.startsWith("@") ? labelFor(input, ctx) : input, at: now });

  let replies: Reply[];
  try {
    replies = await respond(ctx, state, input);
  } catch (e) {
    replies = [{ text: e instanceof BookingError ? e.message : "Sorry, something went wrong on my side. Could you say that again?" }];
  }

  let at = now + 1;
  for (const r of replies) {
    const msg: ChatMessage = {
      id: uid("msg"),
      conversationId,
      role: "assistant",
      text: r.text,
      choices: r.choices,
      link: r.link,
      actions: at === now + 1 && ctx.actions.length ? ctx.actions : undefined,
      at: at++,
    };
    await db.messages.add(msg);
  }
  await db.conversations.update(conversationId, {
    state: JSON.stringify(state),
    updatedAt: Date.now(),
    customerName: state.name ?? conversation.customerName,
    bookingId: ctx.conversation.bookingId,
    needsHuman: ctx.conversation.needsHuman,
  });
  return replies;
}

/** Tapped choices are sent as "@kind:value"; show them in the log as the label the customer saw. */
function labelFor(input: string, ctx: Ctx): string {
  const [kind, a, b] = input.slice(1).split(":");
  if (kind === "slot") return `${fmtTime(Number(a), ctx.business.timeZone)}${b ? ` with ${ctx.staff.find((s) => s.id === b)?.name.split(" ")[0]}` : ""}`;
  if (kind === "service") return ctx.services.find((s) => s.id === a)?.name ?? a;
  if (kind === "date") return fmtDateKey(a, "EEEE d MMM");
  return a ?? input;
}

async function respond(ctx: Ctx, s: State, input: string): Promise<Reply[]> {
  const tz = ctx.business.timeZone;
  const today = todayKey(tz);

  // Structured taps from buttons
  if (input.startsWith("@")) {
    const [kind, a, b] = input.slice(1).split(":");
    if (kind === "service") {
      s.serviceId = a;
      return offerSlots(ctx, s);
    }
    if (kind === "date") {
      s.date = a;
      s.time = undefined;
      s.partOfDay = undefined;
      return s.stage === "reschedule_slot" ? offerReschedule(ctx, s) : offerSlots(ctx, s);
    }
    if (kind === "slot") return s.stage === "reschedule_slot" ? doReschedule(ctx, s, { start: Number(a), staffId: b }) : hold(ctx, s, { start: Number(a), staffId: b });
    if (kind === "manage") return manageAction(ctx, s, a as "cancel" | "reschedule");
  }

  const u = understand(input, { services: ctx.services, staff: ctx.staff, today });

  // Questions get answered at any point, then we carry on where we were.
  const faq = answerQuestion(ctx, u);
  if (faq && !["need_name", "need_email", "need_phone", "manage_code", "manage_email", "manage_otp"].includes(s.stage)) {
    return [faq, ...(s.stage === "choose_slot" ? [{ text: "Shall we carry on with your booking?" }] : [])];
  }

  if (u.intent === "human") return handoff(ctx, s, input);

  switch (s.stage) {
    case "need_name": {
      const name = input.replace(/^(my name is|i am|i'm|it's|this is|name:?)\s*/i, "").trim();
      if (name.length < 2 || /\d/.test(name)) return [{ text: "What's your full name?" }];
      s.name = titleCase(name);
      s.stage = "need_email";
      return [{ text: `Thanks, ${s.name.split(" ")[0]}. What email should I send the confirmation to?` }];
    }
    case "need_email": {
      const email = u.email ?? spokenEmail(input);
      if (!email) return [{ text: "I didn't catch a valid email. Could you type it, like name@example.com?" }];
      s.email = email;
      s.stage = "need_phone";
      return [{ text: "And a phone number, in case the salon needs to reach you?" }];
    }
    case "need_phone": {
      const digits = input.replace(/\D/g, "");
      if (digits.length < 7) return [{ text: "That number looks too short. What's the best number to reach you?" }];
      s.phone = input.trim();
      return finish(ctx, s);
    }
    case "manage_code":
    case "manage_email":
    case "manage_otp":
      return manageStep(ctx, s, u, input);
    case "confirm_cancel":
      if (u.intent === "yes") return doCancel(ctx, s);
      s.stage = "manage_menu";
      return [{ text: "No problem, your booking stays as it is. Anything else?" }];
    case "choose_cut":
      if (/\b(men|man|male|gents|boy|son|him|his)\b/i.test(input)) u.serviceId = "svc_mcut";
      else if (/\b(women|woman|female|ladies|her|she|girl)\b/i.test(input)) u.serviceId = "svc_wcut";
      break;
  }

  if (u.intent === "cancel" || u.intent === "reschedule") {
    s.manage = { code: u.code ?? "", after: u.intent };
    if (u.code) {
      s.stage = "manage_email";
      return [{ text: `Found the reference ${u.code}. What email was the booking made with?` }];
    }
    s.stage = "manage_code";
    return [{ text: "Sure. What's your booking number? It starts with SL- and is in your confirmation email." }];
  }

  // Picking from offered times by saying or typing a time ("2:30", "the first one")
  if ((s.stage === "choose_slot" || s.stage === "reschedule_slot") && s.offered?.length && !u.date && !u.serviceId) {
    const pick =
      u.time !== undefined
        ? s.offered.find((o) => minutesOfDay(o.start, tz) === u.time)
        : u.ordinal
          ? s.offered.at(u.ordinal === -1 ? -1 : u.ordinal - 1)
          : u.intent === "yes"
            ? s.offered[0]
            : undefined;
    if (pick) return s.stage === "reschedule_slot" ? doReschedule(ctx, s, pick) : hold(ctx, s, pick);
    if (u.time !== undefined) {
      s.time = u.time;
      return s.stage === "reschedule_slot" ? offerReschedule(ctx, s) : offerSlots(ctx, s);
    }
  }

  if (s.stage === "reschedule_slot" && (u.date || u.partOfDay || u.time !== undefined)) {
    if (u.date) s.date = u.date;
    s.partOfDay = u.partOfDay ?? s.partOfDay;
    s.time = u.time;
    return offerReschedule(ctx, s);
  }

  if (u.intent === "book" || u.serviceId || u.date || u.staffId || u.partOfDay || u.time !== undefined || s.stage === "choose_cut") {
    if (u.serviceId) s.serviceId = u.serviceId;
    if (u.staffId) s.staffId = u.staffId;
    if (u.date) s.date = u.date;
    if (u.partOfDay) s.partOfDay = u.partOfDay;
    if (u.time !== undefined) s.time = u.time;
    if (!s.serviceId && u.ambiguousCut) {
      s.stage = "choose_cut";
      return [
        {
          text: "Happy to. Is that a women's cut or a men's cut?",
          choices: [
            { label: "Women's cut & style", value: "@service:svc_wcut" },
            { label: "Men's cut", value: "@service:svc_mcut" },
          ],
        },
      ];
    }
    if (!s.serviceId) {
      s.stage = "need_service";
      return [{ text: "Which service would you like?", choices: serviceChoices(ctx) }];
    }
    return offerSlots(ctx, s);
  }

  if (u.intent === "greet") return [{ text: "Hi! What can I help you with today?", choices: ctx.channel === "chat" ? STARTERS : undefined }];
  if (u.intent === "thanks") return [{ text: `You're welcome. See you at ${ctx.business.name}!` }];
  if (u.intent === "no") return [{ text: "No problem. Anything else I can help with?" }];

  return [
    {
      text: "I'm not sure I can help with that one. I can book, move or cancel appointments, or answer questions about services, prices and opening hours. Would you like me to pass this to a person?",
      choices: [
        { label: "Talk to a person", value: "I want to talk to a person" },
        { label: "Book an appointment", value: "I'd like to book an appointment" },
      ],
    },
  ];
}

function answerQuestion(ctx: Ctx, u: Understood): Reply | null {
  const { business: b, services } = ctx;
  const cur = b.currency;
  if (u.intent === "hours") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const open = b.hours[0];
    const openDays = b.hours.map((h) => days[h.weekday]);
    const closed = days.filter((d) => !openDays.includes(d));
    return { text: `We're open ${to12(open.opens)} to ${to12(open.closes)}, every day except ${closed.join(" and ")}.` };
  }
  if (u.intent === "location") return { text: `We're at ${b.address}. You can also call us on ${b.phone}.` };
  if (u.intent === "policy") {
    return {
      text: `Some services take a deposit when you book. You can cancel free of charge until ${b.policy.freeCancelHours} hours before; after that the deposit is kept.`,
    };
  }
  if (u.intent === "price" || u.intent === "services") {
    if (u.serviceId) {
      const s = services.find((x) => x.id === u.serviceId)!;
      const dep = depositFor(s, s.priceCents);
      return {
        text: `${s.name} is ${fmtMoney(s.priceCents, cur)} and takes about ${fmtDuration(s.durationMin)}${dep ? `, with a ${fmtMoney(dep, cur)} deposit when you book` : ""}. Would you like a time?`,
        choices: ctx.channel === "chat" ? [{ label: `Book ${s.name.toLowerCase()}`, value: `@service:${s.id}` }] : undefined,
      };
    }
    const list = services.map((s) => `${s.name} ${fmtMoney(s.priceCents, cur)}`).join(", ");
    return {
      text: ctx.channel === "voice" ? `Popular ones: women's cut and style ${fmtMoney(8500, cur)}, men's cut ${fmtMoney(4500, cur)}, balayage ${fmtMoney(26000, cur)}, gel manicure ${fmtMoney(5000, cur)}. Which would you like?` : `Here's our menu: ${list}. Want to book one?`,
      choices: ctx.channel === "chat" ? serviceChoices(ctx) : undefined,
    };
  }
  return null;
}

function serviceChoices(ctx: Ctx): Choice[] {
  return ctx.services.map((s) => ({ label: s.name, value: `@service:${s.id}` }));
}

async function loadBookings(db: SlotlyDB) {
  const [bookings, timeOff] = await Promise.all([
    db.bookings.where("startsAt").between(Date.now() - 86400000, Date.now() + 62 * 86400000).toArray(),
    db.timeOff.toArray(),
  ]);
  return { bookings, timeOff };
}

/** Tool: find_slots */
async function findSlots(ctx: Ctx, service: Service, staffId: string | undefined, date: string, excludeBookingId?: string) {
  const { bookings, timeOff } = await loadBookings(ctx.db);
  const staff = !staffId || staffId === "any" ? ctx.staff : ctx.staff.filter((m) => m.id === staffId);
  return availableSlots({ business: ctx.business, service, staff, date, bookings, timeOff, excludeBookingId });
}

function narrow(slots: Slot[], s: State, tz: string): Slot[] {
  let out = slots;
  if (s.partOfDay) {
    const [lo, hi] = { morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440] }[s.partOfDay];
    out = out.filter((x) => minutesOfDay(x.start, tz) >= lo && minutesOfDay(x.start, tz) < hi);
  }
  if (s.time !== undefined) {
    const t = s.time;
    out = [...out].sort((a, b) => Math.abs(minutesOfDay(a.start, tz) - t) - Math.abs(minutesOfDay(b.start, tz) - t));
  }
  return out;
}

/** Spread picks across the day so 4 suggestions aren't 4 neighbouring quarter hours. */
function spread(slots: Slot[], n: number): Slot[] {
  if (slots.length <= n) return slots;
  const step = slots.length / n;
  return Array.from({ length: n }, (_, i) => slots[Math.floor(i * step)]);
}

async function offerSlots(ctx: Ctx, s: State): Promise<Reply[]> {
  const tz = ctx.business.timeZone;
  const service = ctx.services.find((x) => x.id === s.serviceId)!;
  const who = s.staffId && s.staffId !== "any" ? ctx.staff.find((m) => m.id === s.staffId) : undefined;
  if (who && !who.serviceIds.includes(service.id)) {
    const doers = ctx.staff.filter((m) => m.serviceIds.includes(service.id)).map((m) => m.name.split(" ")[0]);
    s.staffId = "any";
    return [{ text: `${who.name.split(" ")[0]} doesn't do ${service.name.toLowerCase()}. ${doers.join(" and ")} ${doers.length > 1 ? "do" : "does"}. I'll look for whoever is free.` }, ...(await offerSlots(ctx, s))];
  }

  const today = todayKey(tz);
  const start = s.date ?? today;
  let date = start;
  let slots: Slot[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDaysKey(start, i);
    if (isClosed(ctx.business, d)) continue;
    slots = narrow(await findSlots(ctx, service, s.staffId, d), s, tz);
    if (slots.length) {
      date = d;
      break;
    }
  }
  ctx.actions.push(`find_slots(service: "${service.name}", staff: "${who?.name ?? "any"}", from: ${start}) → ${slots.length} free`);

  if (!slots.length) {
    s.stage = "need_service";
    return [{ text: `I couldn't find a free time for ${service.name.toLowerCase()} in the next two weeks. Would you like me to ask the team to call you?`, choices: [{ label: "Yes, ask a person", value: "Talk to a person please" }] }];
  }

  const exact = s.time !== undefined && minutesOfDay(slots[0].start, tz) === s.time;
  const picks = s.time !== undefined ? slots.slice(0, 4).sort((a, b) => a.start - b.start) : spread(slots, 4);
  s.offered = picks.map((p) => ({ start: p.start, staffId: who ? who.id : p.staffIds[0] }));
  s.date = date;
  s.stage = "choose_slot";

  const dayLabel = date === today ? "today" : date === addDaysKey(today, 1) ? "tomorrow" : fmtDateKey(date, "EEEE d MMMM");
  const moved = start !== date ? `Nothing's free ${start === today ? "today" : `on ${fmtDateKey(start, "EEEE")}`}${s.partOfDay ? ` in the ${s.partOfDay}` : ""}. ` : "";
  const name = (id: string) => ctx.staff.find((m) => m.id === id)!.name.split(" ")[0];
  const times = s.offered.map((o) => `${fmtTime(o.start, tz)}${who ? "" : ` with ${name(o.staffId)}`}`);
  const lead = exact
    ? `Good news, ${times[0]} is free ${dayLabel}.`
    : `${moved}For ${service.name.toLowerCase()} ${dayLabel}, I have ${listJoin(times)}.`;

  const nextDays: Choice[] = [];
  for (let i = 1; nextDays.length < 2 && i < 10; i++) {
    const d = addDaysKey(date, i);
    if (!isClosed(ctx.business, d)) nextDays.push({ label: fmtDateKey(d, "EEE d MMM"), value: `@date:${d}` });
  }

  return [
    {
      text: `${lead} ${ctx.channel === "voice" ? "Which one would you like?" : `Which works? (Times in ${zoneLabel(tz)}.)`}`,
      choices: [
        ...s.offered.map((o, i) => ({ label: times[i], value: `@slot:${o.start}:${o.staffId}` })),
        ...nextDays,
      ],
    },
  ];
}

/** Tool: hold_slot */
async function hold(ctx: Ctx, s: State, pick: OfferedSlot): Promise<Reply[]> {
  const tz = ctx.business.timeZone;
  const service = ctx.services.find((x) => x.id === s.serviceId)!;
  try {
    const b = await holdSlot(
      { businessId: ctx.business.id, serviceId: service.id, staffId: pick.staffId, startsAt: pick.start, source: ctx.channel === "voice" ? "voice" : "ai" },
      ctx.db,
    );
    ctx.actions.push(`hold_slot(${fmtDate(b.startsAt, tz, "EEE d MMM")} ${fmtTime(b.startsAt, tz)}, staff: "${ctx.staff.find((m) => m.id === b.staffId)?.name}") → held ${ctx.business.rules.holdMin} min`);
    s.holdId = b.id;
    ctx.conversation.bookingId = b.id;
    const staff = ctx.staff.find((m) => m.id === b.staffId)!;
    const when = `${fmtDate(b.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(b.startsAt, tz)}`;
    if (s.name && s.email && s.phone) return finish(ctx, s);
    s.stage = "need_name";
    return [{ text: `I've held ${when} with ${staff.name.split(" ")[0]} for you for ${ctx.business.rules.holdMin} minutes. What's your full name?` }];
  } catch (e) {
    if (e instanceof BookingError && e.code === "slot_taken") {
      ctx.actions.push(`hold_slot(${fmtTime(pick.start, tz)}) → taken`);
      return [{ text: "Someone just took that time. Here's what's still free." }, ...(await offerSlots(ctx, s))];
    }
    throw e;
  }
}

/** Tool: confirm_booking */
async function finish(ctx: Ctx, s: State): Promise<Reply[]> {
  const tz = ctx.business.timeZone;
  const booking = s.holdId ? await ctx.db.bookings.get(s.holdId) : undefined;
  if (!booking || booking.status !== "held" || (booking.holdExpiresAt ?? 0) <= Date.now()) {
    s.stage = "choose_slot";
    return [{ text: "The hold on that time ran out. Let me find you fresh times." }, ...(await offerSlots(ctx, s))];
  }
  const details = { name: s.name!, email: s.email!, phone: s.phone! };
  const staff = ctx.staff.find((m) => m.id === booking.staffId)!;
  const service = ctx.services.find((x) => x.id === booking.serviceId)!;
  const when = `${fmtDate(booking.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(booking.startsAt, tz)}`;

  if (booking.depositCents > 0) {
    s.stage = "await_payment";
    ctx.actions.push(`confirm_booking(${booking.code}) → payment link for ${fmtMoney(booking.depositCents, ctx.business.currency)} deposit`);
    const q = new URLSearchParams({
      service: service.id,
      staff: booking.staffId,
      hold: booking.id,
      name: details.name,
      email: details.email,
      phone: details.phone,
    });
    return [
      {
        text: `Almost done. ${service.name} needs a ${fmtMoney(booking.depositCents, ctx.business.currency)} deposit to lock in ${when} with ${staff.name.split(" ")[0]}. ${ctx.channel === "voice" ? "I've put a secure payment link on your screen, and you'll get the confirmation by email." : "Tap below to pay; your details are already filled in."}`,
        link: { label: `Pay ${fmtMoney(booking.depositCents, ctx.business.currency)} deposit`, href: `/b/${ctx.business.slug}/book?${q}` },
      },
    ];
  }

  const done = await confirmBooking(booking.id, details, null, ctx.db);
  ctx.actions.push(`confirm_booking(${done.code}) → confirmed, no deposit`);
  s.stage = "done";
  return [
    {
      text: `You're booked, ${details.name.split(" ")[0]}! ${service.name} with ${staff.name.split(" ")[0]}, ${when}. Your booking number is ${done.code}, and the confirmation is on its way to ${details.email}.`,
      link: { label: "View booking", href: `/booking/${done.code}` },
    },
  ];
}

async function manageStep(ctx: Ctx, s: State, u: Understood, input: string): Promise<Reply[]> {
  const m = (s.manage ??= { code: "" });
  if (s.stage === "manage_code") {
    if (!u.code) return [{ text: "I need the booking number to find it, like SL-AB12CD. You'll find it in your confirmation email." }];
    const b = await findBooking(u.code, ctx.db);
    ctx.actions.push(`find_booking(${u.code}) → ${b ? "found" : "not found"}`);
    if (!b) return [{ text: `I couldn't find ${u.code}. Could you check the number?` }];
    m.code = b.code;
    s.stage = "manage_email";
    return [{ text: "Found it. What email address was it booked with?" }];
  }
  if (s.stage === "manage_email") {
    const email = u.email ?? spokenEmail(input);
    if (!email) return [{ text: "What's the email address on the booking?" }];
    const b = await findBooking(m.code, ctx.db);
    const customer = b?.customerId ? await ctx.db.customers.get(b.customerId) : undefined;
    if (!b || !customer || customer.email !== email) {
      ctx.actions.push(`verify_email(${m.code}) → no match`);
      return [{ text: "That email doesn't match this booking. Could you try the address you booked with?" }];
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    m.email = email;
    m.otp = otp;
    const [service, staff] = await Promise.all([ctx.db.services.get(b.serviceId), ctx.db.staff.get(b.staffId)]);
    await ctx.db.emails.add(buildEmail("verify_code", { business: ctx.business, booking: b, service: service!, staff: staff!, customer, extra: otp }));
    ctx.actions.push(`send_verification_code(${email})`);
    s.stage = "manage_otp";
    return [{ text: "Thanks. To keep your booking safe, I've emailed you a 6-digit code (it's in the Demo inbox). What's the code?" }];
  }
  // manage_otp
  if (u.otp !== m.otp) return [{ text: "That code doesn't match. Please check the latest email and try again." }];
  m.verified = true;
  ctx.actions.push("verify_code → ok");
  return manageAction(ctx, s, m.after ?? "reschedule");
}

async function manageAction(ctx: Ctx, s: State, action: "cancel" | "reschedule"): Promise<Reply[]> {
  const m = s.manage;
  if (!m?.verified) return [{ text: "I need to confirm it's you first. What's your booking number?" }];
  const b = (await findBooking(m.code, ctx.db))!;
  const tz = ctx.business.timeZone;
  if (b.status !== "confirmed") {
    s.stage = "manage_menu";
    return [{ text: `Booking ${b.code} is ${b.status.replace("_", " ")}, so it can't be changed now.` }];
  }
  if (action === "cancel") {
    const t = cancelTerms(b, ctx.business.policy.freeCancelHours, "customer");
    s.stage = "confirm_cancel";
    const money = t.refundCents
      ? `Your ${fmtMoney(t.refundCents, ctx.business.currency)} deposit will be refunded.`
      : t.keptCents
        ? `It's within ${ctx.business.policy.freeCancelHours} hours, so the ${fmtMoney(t.keptCents, ctx.business.currency)} deposit is kept.`
        : "Nothing was paid, so there's nothing to refund.";
    return [
      {
        text: `You're booked for ${fmtDate(b.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(b.startsAt, tz)}. ${money} Shall I cancel it?`,
        choices: [
          { label: "Yes, cancel it", value: "yes" },
          { label: "No, keep it", value: "no" },
        ],
      },
    ];
  }
  s.stage = "reschedule_slot";
  s.serviceId = b.serviceId;
  s.date = undefined;
  s.time = undefined;
  s.partOfDay = undefined;
  return offerReschedule(ctx, s, `You're currently booked for ${fmtDate(b.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(b.startsAt, tz)}. `);
}

async function offerReschedule(ctx: Ctx, s: State, prefix = ""): Promise<Reply[]> {
  const b = (await findBooking(s.manage!.code, ctx.db))!;
  const tz = ctx.business.timeZone;
  const service = ctx.services.find((x) => x.id === b.serviceId)!;
  const start = s.date ?? todayKey(tz);
  let slots: Slot[] = [];
  let date = start;
  for (let i = 0; i < 14 && !slots.length; i++) {
    date = addDaysKey(start, i);
    slots = narrow(await findSlots(ctx, service, b.staffId, date, b.id), s, tz);
  }
  ctx.actions.push(`find_slots(service: "${service.name}", staff: same, from: ${start}) → ${slots.length} free`);
  if (!slots.length) return [{ text: `${prefix}I couldn't find another free time with the same person in the next two weeks. Want me to ask the team?` }];
  const picks = s.time !== undefined ? slots.slice(0, 4).sort((a, c) => a.start - c.start) : spread(slots, 4);
  s.offered = picks.map((p) => ({ start: p.start, staffId: b.staffId }));
  s.date = date;
  const times = s.offered.map((o) => fmtTime(o.start, tz));
  const other = addDaysKey(date, 1);
  return [
    {
      text: `${prefix}On ${fmtDateKey(date, "EEEE d MMMM")} I can move you to ${listJoin(times)}. Which would you like?`,
      choices: [...s.offered.map((o, i) => ({ label: times[i], value: `@slot:${o.start}:${o.staffId}` })), { label: fmtDateKey(other, "EEE d MMM"), value: `@date:${other}` }],
    },
  ];
}

/** Tool: reschedule_booking */
async function doReschedule(ctx: Ctx, s: State, pick: OfferedSlot): Promise<Reply[]> {
  const tz = ctx.business.timeZone;
  const b = await rescheduleBooking(s.manage!.code, pick.start, pick.staffId, "ai", ctx.db);
  ctx.actions.push(`reschedule_booking(${b.code}, ${fmtDate(b.startsAt, tz, "EEE d MMM")} ${fmtTime(b.startsAt, tz)}) → moved`);
  ctx.conversation.bookingId = b.id;
  s.stage = "done";
  return [{ text: `Done. Booking ${b.code} is now ${fmtDate(b.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(b.startsAt, tz)}, same deposit. I've emailed you the new time.` }];
}

/** Tool: cancel_booking */
async function doCancel(ctx: Ctx, s: State): Promise<Reply[]> {
  const r = await cancelBooking(s.manage!.code, "customer", "Cancelled through the receptionist", ctx.db);
  ctx.actions.push(`cancel_booking(${r.booking.code}) → refund ${fmtMoney(r.refundCents, ctx.business.currency)}`);
  ctx.conversation.bookingId = r.booking.id;
  s.stage = "done";
  return [
    {
      text: `Cancelled. ${r.refundCents ? `${fmtMoney(r.refundCents, ctx.business.currency)} is on its way back to your card. ` : ""}Hope to see you another time!`,
      choices: ctx.channel === "chat" ? [{ label: "Book something else", value: "I'd like to book an appointment" }] : undefined,
    },
  ];
}

/** Tool: handoff_to_human */
async function handoff(ctx: Ctx, s: State, input: string): Promise<Reply[]> {
  ctx.conversation.needsHuman = true;
  await ctx.db.emails.add({
    id: uid("eml"),
    businessId: ctx.business.id,
    bookingId: null,
    kind: "ai_handoff",
    to: ctx.business.email,
    subject: "A customer asked to talk to a person",
    lines: [`${s.name ?? "A customer"} wrote: "${input}"`, "Open the conversation to see the full chat and reply."],
    links: [{ label: "Open conversations", href: `/app/${ctx.business.slug}/conversations` }],
    sentAt: Date.now(),
    read: false,
  });
  ctx.actions.push("handoff_to_human → owner emailed");
  return [{ text: `I've passed this to the team at ${ctx.business.name}, and someone will get back to you shortly. You can also call ${ctx.business.phone}.` }];
}

function listJoin(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function to12(t: string) {
  const m = clockToMin(t);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
}

/** "jane dot doe at example dot com" (speech) -> jane.doe@example.com */
function spokenEmail(input: string): string | undefined {
  const t = input
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+/g, "");
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) ? t : undefined;
}
