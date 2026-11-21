import type { Booking, Business, Service, Staff } from "./types";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(b: Booking, business: Business, service: Service, staff: Staff) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${service.name} at ${business.name}`,
    dates: `${stamp(b.startsAt)}/${stamp(b.endsAt)}`,
    details: `With ${staff.name}. Booking ${b.code}.`,
    location: business.address,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function downloadIcs(b: Booking, business: Business, service: Service, staff: Staff) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Slotly//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.code}@slotly`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${service.name} at ${business.name}`,
    `DESCRIPTION:With ${staff.name}. Booking ${b.code}.`,
    `LOCATION:${business.address}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${b.code}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
