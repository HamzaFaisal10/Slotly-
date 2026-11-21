import type { Service } from "./types";

export function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Deposit owed for a booking of the given total. */
export function depositFor(service: Service, totalCents: number): number {
  switch (service.depositType) {
    case "none":
      return 0;
    case "fixed":
      return Math.min(service.depositValue, totalCents);
    case "percent":
      return Math.round((totalCents * service.depositValue) / 100);
  }
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
