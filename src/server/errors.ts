export type BookingErrorCode =
  | "slot_taken"
  | "not_available"
  | "hold_expired"
  | "not_found"
  | "too_late"
  | "invalid";

export class BookingError extends Error {
  constructor(
    public code: BookingErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BookingError";
  }
}

/** Postgres raised our "no overlapping bookings" exclusion constraint. */
export function isOverlapViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const code = (e as { code?: string }).code;
    if (code === "23P01") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
