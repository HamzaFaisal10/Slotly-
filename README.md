# Slotly

Online booking for service businesses: salons, clinics, studios and tutors. Customers book and pay a deposit
from their phone, staff run their day from a live team calendar, and the owner sees bookings, revenue and
no-shows in one dashboard.

The live demo runs a fictional salon, **Lumen Studio**, with 4 staff, 10 services and six weeks of bookings.

## Try it

- **Book as a customer:** `/b/lumen-studio`
- **Owner dashboard:** `/app` (one-click demo sign-in as owner, front desk or a staff member)
- Open both in two tabs. A booking made in one appears in the other's calendar without refreshing.
- Every email the app sends lands in the **Demo inbox** (bottom left).

## What it does

| Area | Features |
| --- | --- |
| Booking page | Services by category, add-ons, "any available" staff, 14-day date strip, live free slots, times in the business's time zone |
| Holds and payment | A slot is held for 10 minutes during checkout; fixed or percentage deposits; unpaid holds release themselves |
| Self-service | Confirmation page, Google Calendar and .ics links, reschedule and cancel from the email link with the cancellation policy applied |
| Team calendar | Day view per staff member with breaks, time off and closed hours; live updates; check-in, done, no-show, cancel and refund |
| Dashboard | Today's appointments, 7-day revenue, upcoming deposits, 30-day no-show rate, latest bookings by source |

## How the booking rules work

One slot engine (`src/lib/slots.ts`) decides what can be booked. The booking page, the dashboard and the
receptionist all call it.

1. Start from the staff member's hours for that date, inside opening hours.
2. Remove closed dates, breaks and time off.
3. Remove existing bookings and live holds, widened by each service's buffers.
4. Step through what is left every 15 minutes; keep a start only if the whole service fits.
5. Drop starts sooner than the minimum notice or past the booking window.

Times are stored in UTC and worked out in the business's time zone, so daylight-saving days stay correct.
Every write (`src/lib/bookings.ts`) re-checks availability inside one read-write transaction, so two people
pressing "Book" at the same moment can never both get the slot.

## Demo mode and production

The demo costs nothing to run and needs no accounts: data lives in each visitor's browser (IndexedDB).
Each piece sits behind its own module, so a production build swaps the implementation, not the app.

| Part | Demo | Production |
| --- | --- | --- |
| Database | IndexedDB via Dexie | Supabase Postgres with row-level security |
| No double booking | Serialised transaction + overlap check | Postgres exclusion constraint on staff + time range |
| Live updates | Cross-tab live queries | Supabase Realtime |
| Sign-in | One-click demo roles | Supabase Auth |
| Payments | Demo checkout | Stripe Checkout, confirmed by webhook |
| Email | Demo inbox | Resend |

## Tech

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Dexie, date-fns-tz, Vitest.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # slot engine, booking rules and seed tests
npm run build
```

Deploys to Vercel with no environment variables.
