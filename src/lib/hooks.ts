"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "./db";

/**
 * Live queries re-run whenever the data changes, in this tab or another,
 * so a booking made in one tab shows up in the dashboard in the other.
 */

export function useBusiness(slug: string) {
  return useLiveQuery(() => getDb().businesses.where("slug").equals(slug).first(), [slug]);
}

export function useCatalog(businessId: string | undefined) {
  return useLiveQuery(async () => {
    if (!businessId) return undefined;
    const db = getDb();
    const [categories, services, addons, staff] = await Promise.all([
      db.categories.where("businessId").equals(businessId).sortBy("position"),
      db.services.where("businessId").equals(businessId).filter((s) => !s.archivedAt && s.online).toArray(),
      db.addons.toArray(),
      db.staff.where("businessId").equals(businessId).filter((s) => s.active).toArray(),
    ]);
    return { categories, services, addons, staff };
  }, [businessId]);
}

export function useBookingByCode(code: string) {
  return useLiveQuery(async () => {
    const db = getDb();
    const booking = await db.bookings.where("code").equals(code.toUpperCase()).first();
    if (!booking) return null;
    const [business, service, staff, customer, addons] = await Promise.all([
      db.businesses.get(booking.businessId),
      db.services.get(booking.serviceId),
      db.staff.get(booking.staffId),
      booking.customerId ? db.customers.get(booking.customerId) : Promise.resolve(undefined),
      db.addons.bulkGet(booking.addonIds),
    ]);
    if (!business || !service || !staff) return null;
    return { booking, business, service, staff, customer, addons: addons.filter((a) => !!a) };
  }, [code]);
}

export function useEmails() {
  return useLiveQuery(() => getDb().emails.orderBy("sentAt").reverse().toArray(), []);
}
