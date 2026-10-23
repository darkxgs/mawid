# Mawid (موعد)

Online booking, WhatsApp reminders and a live schedule for clinics, salons and studios in the Gulf. Arabic first, English one tap away.

**Live demo:** https://mawid-bay.vercel.app
Open the demo clinic from the home page (no sign-up), or book a visit as a patient at `/b/noor-dental` and watch it land on the schedule.

![Mawid landing page](docs/screenshots/landing.png)

## What it does

**For patients** (`/b/[slug]`, Arabic RTL by default)
- Pick a service, a person or "first available", then a real free time. A day strip shows how booked each day is.
- The chosen time is held for a few minutes while they type, with a visible countdown, so nobody else can take it.
- Confirmation on WhatsApp (and email if given), an `.ics` file, a Google Calendar link, and a private link to move or cancel within the clinic's policy.

**For the front desk** (`/dashboard`)
- **Today:** every team member side by side on a timeline with a live now-line, day totals, who is up next and visits waiting to be checked out.
- **Bookings:** search by name or phone, filter, export CSV. Phone and walk-in bookings go through the same checks as online ones.
- **Assistant:** a chat that looks things up ("who's free Thursday afternoon for whitening?") and books, moves or cancels. Every change waits for the owner's approval.
- **Messages:** the outbox of everything sent to patients, in their language.
- **Insights:** appointments per day, busiest hours, no-show rate, where bookings came from, how full each person's week was.
- **Services, Team & hours, Settings:** bilingual services, shifts and breaks, time off, booking rules, the booking link with a QR code.

## How it's built

| | |
|---|---|
| App | Next.js 16 (App Router, Cache Components, Server Actions), React 19, TypeScript |
| Data | Postgres with Drizzle ORM. PGlite (Postgres compiled to WASM) for local dev and tests |
| UI | Tailwind CSS 4, Schibsted Grotesk + Noto Kufi Arabic, no component library |
| AI | AI SDK 7 through Vercel AI Gateway, tool calls with server-signed approvals |
| Messaging | WhatsApp Cloud API and Resend, both optional; without keys messages are recorded as "simulated" |
| Hosting | Vercel (cron for reminders), any Postgres (Supabase, Neon) |

### Decisions worth reading

**Double bookings are impossible, not unlikely.** Each booking stores the time it occupies (appointment plus cleaning gap). A Postgres exclusion constraint rejects any two active rows for the same staff member whose ranges overlap:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (staff_id WITH =, tstzrange(occupied_from, occupied_to, '[)') WITH &&)
  WHERE (status IN ('held', 'confirmed', 'completed'));
```

The application checks availability first for a good error message, but correctness doesn't depend on it. `test/bookings.test.ts` fires five holds at the same slot concurrently and asserts exactly one wins.

**Holds instead of locks.** Picking a time inserts a `held` row with an expiry. Expired holds are deleted only when someone else needs that time, so a slow patient can still confirm if nobody took it. Going back releases the hold immediately.

**Reminders send once.** A sweep claims each reminder with `UPDATE … WHERE reminder_sent_at IS NULL RETURNING` before sending, so overlapping runs can't message a patient twice. It runs from a daily Vercel cron and, throttled through an `app_jobs` row, after normal traffic, which keeps same-day reminders on time without a paid scheduler.

**Time zones.** Instants are stored in UTC; slot grids, working hours and "today" are computed in the business's IANA zone. Calendar days travel as plain `YYYY-MM-DD` strings so nothing shifts on a server in another zone.

**The availability engine is pure.** `src/lib/availability.ts` takes hours, busy ranges and rules and returns slots. It has no database access, which keeps it fast to test.

**The assistant can't act on its own.** Its tools are bound to the signed-in business. Booking, moving and cancelling use `toolApproval: 'user-approval'`, and approvals are HMAC-signed by the server so a modified client can't forge one. Writes reuse the same guarded functions as the website.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No database setup needed: without `DATABASE_URL` the app runs an embedded Postgres in `.data/pglite` and seeds the demo clinic (four months of bookings). Sign in with **Open the demo clinic**, or `demo@mawid.app` / `demo1234`.

```bash
npm test           # 21 tests against a real Postgres engine (PGlite, in memory)
npm run typecheck
npm run lint
```

## Deploy

1. Import the repo on Vercel.
2. Add a Postgres database (Vercel Storage, Supabase or Neon). `DATABASE_URL` or `POSTGRES_URL` is picked up automatically; migrations run during the build with an advisory lock.
3. Set `AUTH_SECRET` (random, 32+ characters) and `CRON_SECRET`.

Optional: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` for real WhatsApp delivery; `RESEND_API_KEY` and `EMAIL_FROM` for email; `MAWID_AI_MODEL` to change the assistant's model (default `anthropic/claude-haiku-4.5`).

Without a database the deployment still works: it falls back to an embedded Postgres in `/tmp`, seeded with the demo, which resets when the instance does.

## Project layout

```
src/
  app/
    b/[slug]/            public booking page
    m/[token]/           patient's manage link
    dashboard/           the front desk (Today, Bookings, Assistant, ...)
    api/                 booking, availability, assistant and cron routes
  components/booking/    day strip, slot grid, ticket, booking flow
  components/dashboard/  timeline, booking sheet, insights charts, ...
  db/                    schema, SQL migrations, demo seed
  lib/                   availability engine, time zones, message templates
  server/                bookings, notifications, reminders, assistant tools
test/                    integration tests on PGlite
```

## Credits

Designed and built by [Seif Ashraf](https://seifashraf.dev). Photography and the hero film were generated for this project with Higgsfield.
