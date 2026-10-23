// Drizzle table definitions that mirror migrations/*.sql.
// The SQL files are the source of truth (they hold the exclusion constraint
// Drizzle can't express); these definitions give us typed queries.
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const businesses = pgTable("businesses", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  kind: text("kind").notNull().default("clinic"),
  tagline: text("tagline"),
  taglineAr: text("tagline_ar"),
  address: text("address"),
  addressAr: text("address_ar"),
  phone: text("phone"),
  coverUrl: text("cover_url"),
  timezone: text("timezone").notNull().default("Asia/Dubai"),
  currency: text("currency").notNull().default("AED"),
  defaultLocale: text("default_locale").notNull().default("ar"),
  slotIntervalMin: integer("slot_interval_min").notNull().default(15),
  minNoticeMin: integer("min_notice_min").notNull().default(60),
  maxAdvanceDays: integer("max_advance_days").notNull().default(30),
  holdMinutes: integer("hold_minutes").notNull().default(5),
  cancelWindowHours: integer("cancel_window_hours").notNull().default(4),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  title: text("title"),
  titleAr: text("title_ar"),
  color: text("color").notNull().default("#1D6B66"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  durationMin: integer("duration_min").notNull(),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  priceMinor: integer("price_minor").notNull().default(0),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const staffServices = pgTable(
  "staff_services",
  {
    staffId: text("staff_id").notNull(),
    serviceId: text("service_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

export const workingHours = pgTable("working_hours", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  weekday: integer("weekday").notNull(),
  startMin: integer("start_min").notNull(),
  endMin: integer("end_min").notNull(),
});

export const timeOff = pgTable("time_off", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  reason: text("reason"),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type BookingStatus = "held" | "confirmed" | "completed" | "cancelled" | "no_show";
export type BookingSource = "web" | "dashboard" | "assistant";

export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  serviceId: text("service_id").notNull(),
  staffId: text("staff_id").notNull(),
  customerId: text("customer_id"),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  occupiedFrom: ts("occupied_from").notNull(),
  occupiedTo: ts("occupied_to").notNull(),
  status: text("status").$type<BookingStatus>().notNull(),
  source: text("source").$type<BookingSource>().notNull().default("web"),
  priceMinor: integer("price_minor").notNull().default(0),
  holdExpiresAt: ts("hold_expires_at"),
  manageToken: text("manage_token").notNull().unique(),
  locale: text("locale").notNull().default("ar"),
  notes: text("notes"),
  reminder24SentAt: ts("reminder_24_sent_at"),
  reminder2SentAt: ts("reminder_2_sent_at"),
  cancelledAt: ts("cancelled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type NotificationKind =
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "cancellation"
  | "reschedule";

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  bookingId: text("booking_id"),
  channel: text("channel").$type<"whatsapp" | "email">().notNull(),
  kind: text("kind").$type<NotificationKind>().notNull(),
  recipient: text("recipient").notNull(),
  body: text("body").notNull(),
  status: text("status").$type<"sent" | "failed" | "simulated">().notNull(),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Service = typeof services.$inferSelect;
export type WorkingHours = typeof workingHours.$inferSelect;
export type TimeOff = typeof timeOff.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
