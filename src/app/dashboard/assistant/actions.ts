"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { Reply, Step } from "@/lib/assistant/types";
import { isDateStr } from "@/lib/time";
import { requireBusiness } from "@/server/auth";
import { respond } from "@/server/assistant-replies";
import { getCatalog } from "@/server/catalog";

const id = z.string().min(1).max(64);
const date = z.string().refine(isDateStr);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const part = z.enum(["morning", "afternoon", "evening"]);
const lang = z.enum(["en", "ar"]);

// Steps arrive from the browser, so they are checked like any other input.
// Every lookup and write below is also scoped to the signed-in business.
const StepSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("text"),
    text: z.string().trim().min(1).max(400),
    expect: z.object({ then: z.enum(["cancel", "move"]).optional(), date: date.optional(), part: part.optional() }).optional(),
  }),
  z.object({ t: z.literal("help") }),
  z.object({ t: z.literal("noop") }),
  z.object({ t: z.literal("day"), date, staffId: id.optional(), part: part.optional() }),
  z.object({ t: z.literal("free"), serviceId: id.optional(), date: date.optional(), staffId: id.optional(), part: part.optional() }),
  z.object({ t: z.literal("stats"), range: z.enum(["today", "yesterday", "week", "lastweek", "month", "lastmonth"]) }),
  z.object({ t: z.literal("customer"), query: z.string().trim().max(80).optional(), then: z.enum(["cancel", "move"]).optional(), date: date.optional(), part: part.optional() }),
  z.object({
    t: z.literal("book"),
    serviceId: id.optional(),
    date: date.optional(),
    time: time.optional(),
    staffId: id.optional(),
    part: part.optional(),
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().min(6).max(24).optional(),
    msgLang: lang.optional(),
  }),
  z.object({ t: z.literal("book.confirm"), serviceId: id, date, time, staffId: id.optional(), name: z.string().trim().min(2).max(80), phone: z.string().trim().min(6).max(24), msgLang: lang }),
  z.object({ t: z.literal("cancel"), bookingId: id }),
  z.object({ t: z.literal("cancel.confirm"), bookingId: id }),
  z.object({ t: z.literal("move"), bookingId: id, date: date.optional(), time: time.optional(), staffId: id.optional(), part: part.optional() }),
  z.object({ t: z.literal("move.confirm"), bookingId: id, date, time, staffId: id.optional() }),
]);

export async function ask(step: Step, replyLang: "en" | "ar"): Promise<Reply> {
  const { db, business } = await requireBusiness();
  const l = lang.catch("en").parse(replyLang);
  const parsed = StepSchema.safeParse(step);
  if (!parsed.success) {
    return { lang: l, text: l === "ar" ? "لم أفهم الطلب. جرّب مرة أخرى." : "That request didn't look right. Try again.", blocks: [], chips: [] };
  }
  const catalog = await getCatalog(db, business);
  const reply = await respond({ db, business, catalog, now: new Date(), defer: (fn) => after(fn) }, parsed.data as Step, l);
  // Keep the rest of the dashboard in step after a booking changes.
  if (parsed.data.t.endsWith(".confirm")) refresh();
  return reply;
}
