// Core domain types. The same shapes back the demo (IndexedDB) and a real
// Postgres/Supabase build, so the app code never depends on the storage.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

/** "HH:mm" in the business's time zone */
export type ClockTime = string;

export interface OpeningHours {
  weekday: Weekday;
  opens: ClockTime;
  closes: ClockTime;
}

export interface ClosedDate {
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface BookingRules {
  minNoticeMin: number;
  windowDays: number;
  slotStepMin: number;
  holdMin: number;
}

export interface CancellationPolicy {
  freeCancelHours: number;
  noShowFeePercent: number;
}

export interface Business {
  id: string;
  slug: string;
  name: string;
  kind: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  email: string;
  timeZone: string;
  currency: string;
  hours: OpeningHours[];
  closedDates: ClosedDate[];
  rules: BookingRules;
  policy: CancellationPolicy;
  aiEnabled: boolean;
  isDemo: boolean;
}

export interface ServiceCategory {
  id: string;
  businessId: string;
  name: string;
  position: number;
}

export type DepositType = "none" | "fixed" | "percent";

export interface Service {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  description: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceCents: number;
  depositType: DepositType;
  depositValue: number; // cents for fixed, percent for percent
  online: boolean;
  archivedAt: number | null;
}

export interface ServiceAddon {
  id: string;
  serviceId: string;
  name: string;
  durationMin: number;
  priceCents: number;
}

export interface StaffDayHours {
  weekday: Weekday;
  start: ClockTime;
  end: ClockTime;
  breakStart?: ClockTime;
  breakEnd?: ClockTime;
}

export interface Staff {
  id: string;
  businessId: string;
  name: string;
  title: string;
  bio: string;
  color: string;
  active: boolean;
  serviceIds: string[];
  hours: StaffDayHours[];
}

export interface TimeOff {
  id: string;
  staffId: string;
  startsAt: number;
  endsAt: number;
  reason: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  noShowCount: number;
  createdAt: number;
}

export type BookingStatus =
  | "held"
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show"
  | "expired";

export type BookingSource = "web" | "ai" | "voice" | "manual";

export interface Booking {
  id: string;
  code: string;
  businessId: string;
  customerId: string | null;
  staffId: string;
  serviceId: string;
  addonIds: string[];
  /** Appointment start/end (UTC ms) */
  startsAt: number;
  endsAt: number;
  /** Time the staff member is blocked, including buffers (UTC ms) */
  blockStart: number;
  blockEnd: number;
  status: BookingStatus;
  holdExpiresAt: number | null;
  totalCents: number;
  depositCents: number;
  paidCents: number;
  source: BookingSource;
  note: string;
  cancelReason: string;
  createdAt: number;
  updatedAt: number;
}

export type PaymentKind = "deposit" | "balance" | "refund";

export interface Payment {
  id: string;
  businessId: string;
  bookingId: string;
  amountCents: number;
  kind: PaymentKind;
  status: "succeeded" | "failed";
  cardLast4: string;
  createdAt: number;
}

export interface Activity {
  id: string;
  businessId: string;
  bookingId: string;
  actor: string;
  action: string;
  meta: string;
  at: number;
}

export type EmailKind =
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "rescheduled"
  | "cancelled"
  | "hold_expired"
  | "staff_new_booking"
  | "staff_change";

export interface DemoEmail {
  id: string;
  businessId: string;
  bookingId: string | null;
  kind: EmailKind;
  to: string;
  subject: string;
  /** Plain-text paragraphs; links are given separately */
  lines: string[];
  links: { label: string; href: string }[];
  sentAt: number;
  read: boolean;
}

/** Statuses that occupy a staff member's time */
export const BLOCKING_STATUSES: BookingStatus[] = [
  "held",
  "confirmed",
  "arrived",
  "completed",
];
