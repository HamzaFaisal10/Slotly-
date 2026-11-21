import type {
  Activity,
  Booking,
  Business,
  Customer,
  Payment,
  Service,
  ServiceAddon,
  ServiceCategory,
  Staff,
  TimeOff,
  Weekday,
} from "./types";
import { addDaysKey, todayKey, weekdayOf, zonedToUtc, clockToMin } from "./time";
import { depositFor } from "./money";

/** Small deterministic RNG so the demo looks the same on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_BUSINESS_ID = "biz_lumen";
export const DEMO_SLUG = "lumen-studio";

const FIRST = [
  "Emma", "Olivia", "Sophia", "Mia", "Amelia", "Harper", "Ella", "Grace", "Chloe", "Zoe",
  "Lily", "Hannah", "Nora", "Aria", "Layla", "Leah", "Ruby", "Isla", "Ivy", "Maya",
  "James", "Liam", "Noah", "Ethan", "Lucas", "Mason", "Daniel", "Adam", "Omar", "Ryan",
];
const LAST = [
  "Bennett", "Hughes", "Patel", "Reyes", "Foster", "Kim", "Nguyen", "Brooks", "Shah", "Ward",
  "Coleman", "Price", "Rivera", "Khan", "Fisher", "Murphy", "Park", "Hayes", "Ellis", "Grant",
];

export interface SeedData {
  business: Business;
  categories: ServiceCategory[];
  services: Service[];
  addons: ServiceAddon[];
  staff: Staff[];
  timeOff: TimeOff[];
  customers: Customer[];
  bookings: Booking[];
  payments: Payment[];
  activity: Activity[];
}

const OPEN_DAYS: Weekday[] = [0, 2, 3, 4, 5, 6]; // closed Monday

export function buildSeed(timeZone: string, now = Date.now()): SeedData {
  const rand = rng(20261121);
  const today = todayKey(timeZone, now);
  const bid = DEMO_BUSINESS_ID;

  // A holiday 9 days out (skipping Mondays) so the date strip shows it closed.
  let holiday = addDaysKey(today, 9);
  if (weekdayOf(holiday) === 1) holiday = addDaysKey(holiday, 1);

  const business: Business = {
    id: bid,
    slug: DEMO_SLUG,
    name: "Lumen Studio",
    kind: "Hair & beauty salon",
    tagline: "Modern hair, colour and skin care",
    about:
      "Lumen Studio is a small team of stylists and therapists. We do precision cuts, lived-in colour and calm, unhurried skin treatments.",
    address: "214 Market Street, Suite 3",
    phone: "+1 (555) 014-2230",
    email: "hello@lumenstudio.demo",
    timeZone,
    currency: "USD",
    hours: OPEN_DAYS.map((weekday) => ({ weekday, opens: "09:00", closes: "19:00" })),
    closedDates: [{ date: holiday, reason: "Team training day" }],
    rules: { minNoticeMin: 120, windowDays: 60, slotStepMin: 15, holdMin: 10 },
    policy: { freeCancelHours: 24, noShowFeePercent: 50 },
    aiEnabled: true,
    isDemo: true,
  };

  const categories: ServiceCategory[] = [
    { id: "cat_hair", businessId: bid, name: "Hair", position: 0 },
    { id: "cat_colour", businessId: bid, name: "Colour", position: 1 },
    { id: "cat_nails", businessId: bid, name: "Nails & Skin", position: 2 },
  ];

  const svc = (
    id: string,
    categoryId: string,
    name: string,
    description: string,
    durationMin: number,
    price: number,
    depositType: Service["depositType"],
    depositValue: number,
    bufferAfterMin = 10,
  ): Service => ({
    id,
    businessId: bid,
    categoryId,
    name,
    description,
    durationMin,
    bufferBeforeMin: 0,
    bufferAfterMin,
    priceCents: price * 100,
    depositType,
    depositValue,
    online: true,
    archivedAt: null,
  });

  const services: Service[] = [
    svc("svc_wcut", "cat_hair", "Women's cut & style", "Consultation, wash, precision cut and blow-dry.", 60, 85, "fixed", 2000),
    svc("svc_mcut", "cat_hair", "Men's cut", "Clipper or scissor cut, wash and style.", 30, 45, "none", 0),
    svc("svc_fringe", "cat_hair", "Fringe trim", "A quick tidy between cuts.", 20, 20, "none", 0, 5),
    svc("svc_blow", "cat_hair", "Wash & blow-dry", "Wash, scalp massage and a smooth or bouncy finish.", 45, 55, "none", 0),
    svc("svc_roots", "cat_colour", "Root touch-up", "Permanent colour on regrowth, with a gloss.", 90, 120, "percent", 30, 15),
    svc("svc_full", "cat_colour", "Full colour", "All-over permanent colour, root to tip.", 120, 165, "percent", 30, 15),
    svc("svc_balayage", "cat_colour", "Balayage", "Hand-painted, lived-in highlights with toner.", 180, 260, "percent", 30, 15),
    svc("svc_gel", "cat_nails", "Gel manicure", "Shape, cuticle care and long-wear gel polish.", 45, 50, "fixed", 1000),
    svc("svc_facial", "cat_nails", "Signature facial", "Cleanse, exfoliation, massage and mask.", 60, 95, "fixed", 2000),
    svc("svc_brows", "cat_nails", "Brow shape & tint", "Wax, tidy and tint for defined brows.", 30, 35, "none", 0, 5),
  ];

  const addons: ServiceAddon[] = [
    { id: "add_condition", serviceId: "svc_wcut", name: "Deep conditioning", durationMin: 15, priceCents: 2000 },
    { id: "add_condition2", serviceId: "svc_blow", name: "Deep conditioning", durationMin: 15, priceCents: 2000 },
    { id: "add_gloss", serviceId: "svc_full", name: "Toner & gloss", durationMin: 20, priceCents: 3000 },
    { id: "add_art", serviceId: "svc_gel", name: "Nail art (2 nails)", durationMin: 15, priceCents: 1500 },
  ];

  const days = (off: Weekday, start: string, end: string, br: [string, string]) =>
    OPEN_DAYS.filter((d) => d !== off).map((weekday) => ({
      weekday,
      start,
      end,
      breakStart: br[0],
      breakEnd: br[1],
    }));

  const staff: Staff[] = [
    {
      id: "stf_sara",
      businessId: bid,
      name: "Sara Malik",
      title: "Senior stylist",
      bio: "12 years behind the chair. Precision bobs and soft layers.",
      color: "#7c6cf0",
      active: true,
      serviceIds: ["svc_wcut", "svc_mcut", "svc_fringe", "svc_blow"],
      hours: days(0, "09:00", "17:00", ["13:00", "13:45"]),
    },
    {
      id: "stf_leo",
      businessId: bid,
      name: "Leo Carter",
      title: "Stylist",
      bio: "Men's cuts, fades and textured styles.",
      color: "#0ea5a0",
      active: true,
      serviceIds: ["svc_wcut", "svc_mcut", "svc_fringe", "svc_blow"],
      hours: days(3, "11:00", "19:00", ["15:00", "15:30"]),
    },
    {
      id: "stf_ava",
      businessId: bid,
      name: "Ava Chen",
      title: "Colour specialist",
      bio: "Balayage, grey blending and colour corrections.",
      color: "#e8795a",
      active: true,
      serviceIds: ["svc_roots", "svc_full", "svc_balayage", "svc_blow"],
      hours: days(2, "09:00", "18:00", ["13:30", "14:15"]),
    },
    {
      id: "stf_noor",
      businessId: bid,
      name: "Noor Ahmed",
      title: "Nail & skin therapist",
      bio: "Gel nails, facials and brow artistry.",
      color: "#d4537e",
      active: true,
      serviceIds: ["svc_gel", "svc_facial", "svc_brows"],
      hours: days(6, "10:00", "18:00", ["14:00", "14:30"]),
    },
  ];

  // One afternoon off for Leo later this week.
  const offDay = (() => {
    let d = addDaysKey(today, 3);
    while (![0, 2, 4, 5, 6].includes(weekdayOf(d)) || d === holiday) d = addDaysKey(d, 1);
    return d;
  })();
  const timeOff: TimeOff[] = [
    {
      id: "off_leo1",
      staffId: "stf_leo",
      startsAt: zonedToUtc(offDay, "15:30", timeZone),
      endsAt: zonedToUtc(offDay, "19:00", timeZone),
      reason: "Dentist appointment",
    },
  ];

  const customers: Customer[] = [];
  const usedNames = new Set<string>();
  while (customers.length < 60) {
    const f = FIRST[Math.floor(rand() * FIRST.length)];
    const l = LAST[Math.floor(rand() * LAST.length)];
    const name = `${f} ${l}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const i = customers.length;
    customers.push({
      id: `cus_${i}`,
      businessId: bid,
      name,
      email: `${f}.${l}`.toLowerCase() + "@example.com",
      phone: `+1 (555) ${String(200 + i).padStart(3, "0")}-${String(1000 + Math.floor(rand() * 8999))}`,
      notes: i === 3 ? "Sensitive scalp, use ammonia-free colour." : i === 11 ? "Prefers a quiet appointment." : "",
      noShowCount: 0,
      createdAt: now - 1000 * 60 * 60 * 24 * (60 + i),
    });
  }

  const bookings: Booking[] = [];
  const payments: Payment[] = [];
  const activity: Activity[] = [];
  let seq = 0;
  const codeRand = rng(77);
  const codeFor = () => {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += A[Math.floor(codeRand() * A.length)];
    return `SL-${s}`;
  };


  const svcById = new Map(services.map((s) => [s.id, s]));
  let noShows = 0;
  let cancels = 0;

  for (let offset = -35; offset <= 10; offset++) {
    const date = addDaysKey(today, offset);
    const wd = weekdayOf(date);
    if (!OPEN_DAYS.includes(wd) || date === holiday) continue;
    for (const s of staff) {
      const h = s.hours.find((x) => x.weekday === wd);
      if (!h) continue;
      // Busier in the past (it looks lived-in), lighter ahead so slots stay free.
      const target = offset < 0 ? 1 + Math.floor(rand() * 2) : offset === 0 ? 2 : Math.floor(rand() * 2);
      let cursor = clockToMin(h.start) + Math.floor(rand() * 4) * 30;
      for (let k = 0; k < target; k++) {
        const service = svcById.get(s.serviceIds[Math.floor(rand() * s.serviceIds.length)])!;
        const addon = addons.find((a) => a.serviceId === service.id && rand() < 0.35);
        const dur = service.durationMin + (addon?.durationMin ?? 0);
        const brS = clockToMin(h.breakStart!);
        const brE = clockToMin(h.breakEnd!);
        if (cursor < brE && cursor + dur + service.bufferAfterMin > brS) cursor = brE;
        if (cursor + dur + service.bufferAfterMin > clockToMin(h.end)) break;
        const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
        const mm = String(cursor % 60).padStart(2, "0");
        const startsAt = zonedToUtc(date, `${hh}:${mm}`, timeZone);
        const endsAt = startsAt + dur * 60000;
        const total = service.priceCents + (addon?.priceCents ?? 0);
        const deposit = depositFor(service, total);
        const customer = customers[Math.floor(rand() * customers.length)];

        let status: Booking["status"] = endsAt < now ? "completed" : "confirmed";
        if (status === "completed" && offset < -2 && noShows < 4 && rand() < 0.06) {
          status = "no_show";
          noShows++;
          customer.noShowCount++;
        } else if (offset < -1 && cancels < 6 && rand() < 0.07) {
          status = "cancelled";
          cancels++;
        }
        const paid = status === "completed" ? total : status === "cancelled" ? 0 : deposit;
        const id = `bkg_${seq}`;
        const createdAt = Math.min(startsAt - (2 + Math.floor(rand() * 10)) * 86400000, now - (2 + (seq % 40)) * 3600000);
        bookings.push({
          id,
          code: codeFor(),
          businessId: bid,
          customerId: customer.id,
          staffId: s.id,
          serviceId: service.id,
          addonIds: addon ? [addon.id] : [],
          startsAt,
          endsAt,
          blockStart: startsAt - service.bufferBeforeMin * 60000,
          blockEnd: endsAt + service.bufferAfterMin * 60000,
          status,
          holdExpiresAt: null,
          totalCents: total,
          depositCents: deposit,
          paidCents: paid,
          source: rand() < 0.15 ? "ai" : rand() < 0.2 ? "manual" : "web",
          note: "",
          cancelReason: status === "cancelled" ? "Customer cancelled online" : "",
          createdAt,
          updatedAt: createdAt,
        });
        if (deposit > 0 && status !== "cancelled") {
          payments.push({
            id: `pay_${seq}_d`,
            businessId: bid,
            bookingId: id,
            amountCents: deposit,
            kind: "deposit",
            status: "succeeded",
            cardLast4: "4242",
            createdAt,
          });
        }
        if (status === "completed" && total - deposit > 0) {
          payments.push({
            id: `pay_${seq}_b`,
            businessId: bid,
            bookingId: id,
            amountCents: total - deposit,
            kind: "balance",
            status: "succeeded",
            cardLast4: "4242",
            createdAt: endsAt,
          });
        }
        activity.push({
          id: `act_${seq}`,
          businessId: bid,
          bookingId: id,
          actor: "customer",
          action: "booked",
          meta: "",
          at: createdAt,
        });
        seq++;
        cursor = Math.ceil((cursor + dur + service.bufferAfterMin) / 15) * 15 + Math.floor(rand() * 3) * 30;
      }
    }
  }

  return { business, categories, services, addons, staff, timeOff, customers, bookings, payments, activity };
}
