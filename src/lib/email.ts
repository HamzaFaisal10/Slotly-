import type { Booking, Business, Customer, DemoEmail, EmailKind, Service, Staff } from "./types";
import { uid } from "./db";
import { fmtDate, fmtTime, zoneLabel } from "./time";
import { fmtMoney } from "./money";

/**
 * Demo email. In production these go through Resend with React Email
 * templates; in the demo they land in the on-screen Demo inbox.
 */
export function buildEmail(
  kind: EmailKind,
  ctx: {
    business: Business;
    booking: Booking;
    service: Service;
    staff: Staff;
    customer?: Customer | null;
    extra?: string;
  },
): DemoEmail {
  const { business, booking, service, staff, customer } = ctx;
  const tz = business.timeZone;
  const when = `${fmtDate(booking.startsAt, tz, "EEEE d MMMM")} at ${fmtTime(booking.startsAt, tz)} (${zoneLabel(tz)})`;
  const manage = { label: "Manage booking", href: `/booking/${booking.code}` };
  const rebook = { label: "Book again", href: `/b/${business.slug}/book` };
  const due = booking.totalCents - booking.paidCents;
  const first = customer?.name.split(" ")[0] ?? "there";

  const base = {
    id: uid("eml"),
    businessId: business.id,
    bookingId: booking.id,
    kind,
    sentAt: Date.now(),
    read: false,
  };

  switch (kind) {
    case "confirmation":
      return {
        ...base,
        to: customer?.email ?? "",
        subject: `Booked: ${service.name} on ${fmtDate(booking.startsAt, tz)}`,
        lines: [
          `Hi ${first}, you're booked at ${business.name}.`,
          `${service.name} with ${staff.name}, ${when}.`,
          `Booking number ${booking.code}. Paid ${fmtMoney(booking.paidCents, business.currency)}${due > 0 ? `, ${fmtMoney(due, business.currency)} due at the visit` : ""}.`,
          `${business.address}. Free cancellation until ${business.policy.freeCancelHours} hours before.`,
        ],
        links: [manage],
      };
    case "rescheduled":
      return {
        ...base,
        to: customer?.email ?? "",
        subject: `New time: ${service.name} on ${fmtDate(booking.startsAt, tz)}`,
        lines: [`Hi ${first}, your booking ${booking.code} has moved.`, `New time: ${when} with ${staff.name}.`],
        links: [manage],
      };
    case "cancelled":
      return {
        ...base,
        to: customer?.email ?? "",
        subject: `Cancelled: ${service.name} on ${fmtDate(booking.startsAt, tz)}`,
        lines: [`Hi ${first}, booking ${booking.code} is cancelled.`, ctx.extra ?? ""].filter(Boolean),
        links: [rebook],
      };
    case "hold_expired":
      return {
        ...base,
        to: customer?.email ?? "",
        subject: "Your held time was released",
        lines: [`The time we held for ${service.name} on ${when} was released because payment was not finished.`],
        links: [rebook],
      };
    case "reminder_24h":
    case "reminder_2h":
      return {
        ...base,
        to: customer?.email ?? "",
        subject: `Reminder: ${service.name} ${kind === "reminder_24h" ? "tomorrow" : "in 2 hours"}`,
        lines: [`Hi ${first}, see you ${when} with ${staff.name}.`],
        links: [manage],
      };
    case "staff_new_booking":
      return {
        ...base,
        to: `${staff.name.split(" ")[0].toLowerCase()}@lumenstudio.demo`,
        subject: `New booking: ${customer?.name ?? "Customer"}, ${fmtDate(booking.startsAt, tz)} ${fmtTime(booking.startsAt, tz)}`,
        lines: [`${service.name} with ${customer?.name ?? "a customer"}, ${when}.`],
        links: [{ label: "Open in dashboard", href: `/app/${business.slug}/bookings/${booking.code}` }],
      };
    case "staff_change":
      return {
        ...base,
        to: `${staff.name.split(" ")[0].toLowerCase()}@lumenstudio.demo`,
        subject: `Booking changed: ${booking.code}`,
        lines: [ctx.extra ?? `Booking ${booking.code} changed.`],
        links: [{ label: "Open in dashboard", href: `/app/${business.slug}/bookings/${booking.code}` }],
      };
  }
}
