"use client";

import { Check, Mail, MessageCircle, Phone, Undo2, UserX, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { bookingMessages, setStatus } from "@/app/dashboard/actions";
import { Avatar, Button, Spinner } from "@/components/ui";
import { formatDateLong, formatDuration, formatMoney, formatTime, enDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { DashBooking } from "@/server/dashboard";
import { useNow } from "@/components/booking/shared";
import { Overlay, SOURCE, StatusBadge } from "./common";

type Msg = { id: string; kind: string; channel: string; status: string; createdAt: string };
export type SheetBooking = DashBooking & { messages?: Msg[] };
export type TeamLite = { id: string; name: string; color: string };

const KIND: Record<string, string> = {
  confirmation: "Booking confirmation",
  reminder_24h: "Day-before reminder",
  reminder_2h: "Same-day reminder",
  cancellation: "Cancellation notice",
  reschedule: "New time notice",
};

export function BookingSheet({
  booking,
  team,
  currency,
  tz,
  onClose,
}: {
  booking: SheetBooking | null;
  team: TeamLite[];
  currency: string;
  tz: string;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [current, setCurrent] = useState<SheetBooking | null>(booking);
  const [shown, setShown] = useState<SheetBooking | null>(booking);
  // Fetched trails, by booking id (bookings from the day view already carry theirs).
  const [fetched, setFetched] = useState<Record<string, Msg[]>>({});
  const now = useNow(true, 30_000);

  // A different booking was opened: reset per-booking UI state while rendering,
  // and keep the last one around while the sheet animates closed.
  if (booking !== shown) {
    setShown(booking);
    if (booking) {
      setCurrent(booking);
      setError(null);
      setConfirmCancel(false);
    }
  }

  useEffect(() => {
    if (!booking || booking.messages || fetched[booking.id]) return;
    let live = true;
    bookingMessages(booking.id)
      .then((m) => live && setFetched((f) => ({ ...f, [booking.id]: m })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [booking, fetched]);

  const b = current;
  const messages: Msg[] | null = b ? (b.messages ?? fetched[b.id] ?? null) : null;
  const member = b ? team.find((t) => t.id === b.staffId) : null;
  const start_ = b ? new Date(b.startsAt) : null;
  const ended = !!b && now > 0 && new Date(b.endsAt).getTime() < now;
  const started = !!b && now > 0 && new Date(b.startsAt).getTime() <= now;

  function act(status: "confirmed" | "completed" | "cancelled" | "no_show") {
    if (!b) return;
    setError(null);
    start(async () => {
      const r = await setStatus(b.id, status);
      if (!r.ok) setError(r.error);
      else {
        setCurrent({ ...b, status });
        setConfirmCancel(false);
      }
    });
  }

  return (
    <Overlay
      open={!!booking}
      onClose={onClose}
      variant="sheet"
      width={440}
      title={b ? <span className="flex items-center gap-3">{b.customer?.name ?? "Walk-in"} <StatusBadge status={b.status} /></span> : ""}
      footer={
        b ? (
          <div className="grid gap-2">
            {error ? <p className="rounded-control bg-rose-soft px-3 py-2 text-[13px] text-rose">{error}</p> : null}
            {b.status === "confirmed" && confirmCancel ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="me-auto text-[14px]">Cancel and notify {b.customer?.name.split(" ")[0] ?? "the customer"}?</span>
                <Button variant="danger" onClick={() => act("cancelled")} disabled={pending}>
                  {pending ? <Spinner /> : null}
                  Cancel booking
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={pending}>
                  Keep
                </Button>
              </div>
            ) : b.status === "confirmed" ? (
              <div className="flex flex-wrap gap-2">
                {started ? (
                  <>
                    <Button onClick={() => act("completed")} disabled={pending}>
                      <Check className="size-4" /> Attended
                    </Button>
                    <Button variant="outline" onClick={() => act("no_show")} disabled={pending}>
                      <UserX className="size-4" /> No-show
                    </Button>
                  </>
                ) : null}
                {!ended ? (
                  <Button variant="danger" className={started ? "" : "me-auto"} onClick={() => setConfirmCancel(true)} disabled={pending}>
                    <X className="size-4" /> Cancel booking
                  </Button>
                ) : null}
                {pending ? <Spinner className="self-center" /> : null}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => act("confirmed")} disabled={pending}>
                  <Undo2 className="size-4" />
                  {b.status === "cancelled" ? "Restore booking" : "Undo"}
                </Button>
                {pending ? <Spinner /> : null}
              </div>
            )}
          </div>
        ) : null
      }
    >
      {b && start_ ? (
        <div className="grid gap-6">
          <section>
            <p className="font-display text-[22px] leading-tight font-semibold">{b.service.name}</p>
            <p className="tnum mt-1 text-[15px] text-ink-2">
              {formatDateLong(start_, tz, "en")}, {formatTime(start_, tz, "en")} to {formatTime(new Date(b.endsAt), tz, "en")}
            </p>
            {member ? (
              <p className="mt-3 flex items-center gap-2 text-[14px]">
                <Avatar name={member.name} color={member.color} size={24} />
                {member.name}
              </p>
            ) : null}
          </section>

          {b.customer ? (
            <section className="rounded-[14px] border border-mist p-4">
              <p className="text-[13px] text-muted">Customer</p>
              <p className="mt-1 text-[16px] font-medium">{b.customer.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`https://wa.me/${b.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e7f8ee] px-3 text-[13px] font-medium text-[#0b7a3e] hover:bg-[#d4f2e1]">
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
                <a href={`tel:${b.customer.phone}`} className="tnum inline-flex h-8 items-center gap-1.5 rounded-full bg-mist-2 px-3 text-[13px] text-ink-2 hover:bg-mist">
                  <Phone className="size-3.5" /> {formatPhone(b.customer.phone)}
                </a>
                {b.customer.email ? (
                  <a href={`mailto:${b.customer.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-mist-2 px-3 text-[13px] text-ink-2 hover:bg-mist">
                    <Mail className="size-3.5" /> Email
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
            <div>
              <dt className="text-[13px] text-muted">Price</dt>
              <dd className="mt-0.5">{formatMoney(b.priceMinor, currency, "en")}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Length</dt>
              <dd className="mt-0.5">{formatDuration(Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000), "en")}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Booked</dt>
              <dd className="mt-0.5">{SOURCE[b.source] ?? b.source}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Messages in</dt>
              <dd className="mt-0.5">{b.locale === "ar" ? "Arabic" : "English"}</dd>
            </div>
          </dl>

          {b.notes ? (
            <section>
              <p className="text-[13px] text-muted">Note from the customer</p>
              <p className="mt-1 rounded-[12px] bg-saffron-soft px-3.5 py-2.5 text-[14px] leading-relaxed" dir="auto">
                {b.notes}
              </p>
            </section>
          ) : null}

          <section>
            <p className="text-[13px] text-muted">Messages</p>
            {messages === null ? (
              <Spinner className="mt-3 text-muted" />
            ) : messages.length ? (
              <ol className="mt-2 grid gap-2.5 border-s border-mist ps-4">
                {messages.map((m) => (
                  <li key={m.id} className="relative text-[13.5px]">
                    <span className="absolute top-1.5 -start-[21px] size-2 rounded-full bg-sea ring-4 ring-card" />
                    <span className="font-medium">{KIND[m.kind] ?? m.kind}</span>
                    <span className="text-muted">
                      {" "}
                      on {m.channel === "whatsapp" ? "WhatsApp" : "email"}, {formatTime(new Date(m.createdAt), tz, "en")}{" "}
                      {enDate(m.createdAt, { day: "numeric", month: "short" }, tz)}
                    </span>
                    {m.status !== "sent" ? <span className={m.status === "failed" ? "text-rose" : "text-faint"}> ({m.status})</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[14px] text-faint">Nothing sent yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </Overlay>
  );
}
