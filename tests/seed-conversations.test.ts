import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { SlotlyDB } from "@/lib/db";
import { resetDemo } from "@/lib/store";

it("seeds example receptionist conversations, one booked and one needing a person", async () => {
  const db = new SlotlyDB("seed-conversations");
  await resetDemo(db, "Europe/London");
  const convs = await db.conversations.toArray();
  expect(convs).toHaveLength(3);
  expect(convs.some((c) => c.bookingId && c.customerName === "Daniel Reyes")).toBe(true);
  expect(convs.some((c) => c.needsHuman)).toBe(true);
  expect(await db.emails.count()).toBe(0);
});
