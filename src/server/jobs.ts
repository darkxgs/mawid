import "server-only";
import { and, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import { getConnection, type Connection } from "@/db";
import { bookings, businesses } from "@/db/schema";
import { rawQuery } from "@/db/raw";
import { DEMO, topUpDemoBookings } from "@/db/seed";
import { notifyBooking } from "./notify";

const HOUR = 3_600_000;
const SWEEP_EVERY_MIN = 5;

export type SweepResult = {
  ran: boolean;
  reminders24h: number;
  reminders2h: number;
  completed: number;
  clearedHolds: number;
};

/**
 * Claims the right to run a job. Returns false when another instance ran it
 * within the interval, so bursts of traffic never fan out into duplicate work.
 */
async function claim(raw: Connection["raw"], key: string, everyMin: number, force: boolean) {
  const rows = await rawQuery<{ key: string }>(
    raw,
    `INSERT INTO app_jobs (key, ran_at) VALUES ($1, now())
     ON CONFLICT (key) DO UPDATE SET ran_at = excluded.ran_at
     WHERE $3::boolean OR app_jobs.ran_at < now() - make_interval(mins => $2::int)
     RETURNING key`,
    [key, everyMin, force],
  );
  return rows.length > 0;
}

/**
 * Reminders and housekeeping.
 *
 * - 24h reminder: for bookings made at least a day ahead, sent once the visit is
 *   less than 24 hours away (and more than 2 hours, otherwise only the short one goes).
 * - 2h reminder: sent once the visit is less than 2 hours away, unless the booking
 *   itself was made within the last 3 hours of the visit.
 * - Each reminder is claimed with an UPDATE ... WHERE sent_at IS NULL before it is
 *   delivered, so overlapping runs can never send the same message twice.
 */
export async function runSweep(
  opts: { force?: boolean; now?: Date; conn?: Connection } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const conn = opts.conn ?? (await getConnection());
  const { db, raw } = conn;
  const empty = { ran: false, reminders24h: 0, reminders2h: 0, completed: 0, clearedHolds: 0 };
  if (!(await claim(raw, "sweep", SWEEP_EVERY_MIN, !!opts.force))) return empty;

  const in2h = new Date(now.getTime() + 2 * HOUR);
  const in24h = new Date(now.getTime() + 24 * HOUR);

  const due24 = await db
    .update(bookings)
    .set({ reminder24SentAt: now })
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminder24SentAt),
        isNull(bookings.reminder2SentAt),
        gt(bookings.startsAt, in2h),
        lte(bookings.startsAt, in24h),
        sql`${bookings.startsAt} - ${bookings.createdAt} > interval '26 hours'`,
      ),
    )
    .returning({ id: bookings.id });

  const due2 = await db
    .update(bookings)
    .set({ reminder2SentAt: now })
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminder2SentAt),
        gt(bookings.startsAt, now),
        lte(bookings.startsAt, in2h),
        sql`${bookings.startsAt} - ${bookings.createdAt} > interval '3 hours'`,
      ),
    )
    .returning({ id: bookings.id });

  await Promise.allSettled([
    ...due24.map((b) => notifyBooking(db, b.id, "reminder_24h")),
    ...due2.map((b) => notifyBooking(db, b.id, "reminder_2h")),
  ]);

  // Appointments nobody checked out are treated as attended 12 hours after they end.
  const completed = await db
    .update(bookings)
    .set({ status: "completed" })
    .where(and(eq(bookings.status, "confirmed"), lt(bookings.endsAt, new Date(now.getTime() - 12 * HOUR))))
    .returning({ id: bookings.id });

  // Expired holds are harmless (they are replaced on demand) but should not pile up.
  const cleared = await db
    .delete(bookings)
    .where(and(eq(bookings.status, "held"), lt(bookings.holdExpiresAt, new Date(now.getTime() - HOUR))))
    .returning({ id: bookings.id });

  // Keep the public demo looking alive: new days get realistic bookings.
  if (process.env.MAWID_SEED_DEMO !== "0") {
    const [demo] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, DEMO.businessId));
    if (demo && (await claim(raw, "demo_top_up", 60, !!opts.force))) await topUpDemoBookings(raw, now);
  }

  return {
    ran: true,
    reminders24h: due24.length,
    reminders2h: due2.length,
    completed: completed.length,
    clearedHolds: cleared.length,
  };
}

/** Fire-and-forget variant for `after()` callbacks; never throws. */
export async function kickSweep() {
  try {
    await runSweep();
  } catch (err) {
    console.error("[sweep]", err);
  }
}
