import Dexie, { type EntityTable } from "dexie";
import type {
  Activity,
  Booking,
  Business,
  Customer,
  DemoEmail,
  Payment,
  Service,
  ServiceAddon,
  ServiceCategory,
  Staff,
  TimeOff,
} from "./types";

/**
 * Demo storage: IndexedDB in the visitor's browser.
 * Each table mirrors a Postgres table in the production schema.
 */
export class SlotlyDB extends Dexie {
  businesses!: EntityTable<Business, "id">;
  categories!: EntityTable<ServiceCategory, "id">;
  services!: EntityTable<Service, "id">;
  addons!: EntityTable<ServiceAddon, "id">;
  staff!: EntityTable<Staff, "id">;
  timeOff!: EntityTable<TimeOff, "id">;
  customers!: EntityTable<Customer, "id">;
  bookings!: EntityTable<Booking, "id">;
  payments!: EntityTable<Payment, "id">;
  activity!: EntityTable<Activity, "id">;
  emails!: EntityTable<DemoEmail, "id">;
  meta!: EntityTable<{ key: string; value: string }, "key">;

  constructor(name = "slotly-demo") {
    super(name);
    this.version(1).stores({
      businesses: "id, &slug",
      categories: "id, businessId",
      services: "id, businessId, categoryId",
      addons: "id, serviceId",
      staff: "id, businessId",
      timeOff: "id, staffId, startsAt",
      customers: "id, businessId, email",
      bookings: "id, &code, businessId, staffId, customerId, status, startsAt, [staffId+startsAt]",
      payments: "id, businessId, bookingId, createdAt",
      activity: "id, bookingId, at",
      emails: "id, businessId, bookingId, sentAt",
      meta: "key",
    });
  }
}

let instance: SlotlyDB | null = null;

export function getDb(): SlotlyDB {
  if (!instance) instance = new SlotlyDB();
  return instance;
}

/** For tests: use a fresh, isolated database. */
export function setDb(db: SlotlyDB) {
  instance = db;
}

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return prefix ? `${prefix}_${rand}` : rand;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function bookingCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `SL-${s}`;
}
