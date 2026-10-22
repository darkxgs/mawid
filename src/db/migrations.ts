// SQL migrations, applied in order and tracked in the _migrations table.
// They live in a TS module (not .sql files) so they are bundled with every
// serverless function and never depend on files being traced at deploy time.
export const migrations: { name: string; sql: string }[] = [
  {
    name: "0001_init",
    sql: /* sql */ `
-- Mawid initial schema.
-- The interesting part is at the bottom: an exclusion constraint that makes it
-- impossible (at the database level) for one staff member to have two active
-- bookings whose time ranges overlap, even under concurrent requests.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
  id                     text PRIMARY KEY,
  owner_id               text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug                   text NOT NULL UNIQUE,
  name                   text NOT NULL,
  name_ar                text,
  kind                   text NOT NULL DEFAULT 'clinic',
  tagline                text,
  tagline_ar             text,
  address                text,
  address_ar             text,
  phone                  text,
  timezone               text NOT NULL DEFAULT 'Asia/Dubai',
  currency               text NOT NULL DEFAULT 'AED',
  default_locale         text NOT NULL DEFAULT 'ar',
  slot_interval_min      integer NOT NULL DEFAULT 15 CHECK (slot_interval_min BETWEEN 5 AND 120),
  min_notice_min         integer NOT NULL DEFAULT 60 CHECK (min_notice_min >= 0),
  max_advance_days       integer NOT NULL DEFAULT 30 CHECK (max_advance_days BETWEEN 1 AND 365),
  hold_minutes           integer NOT NULL DEFAULT 5 CHECK (hold_minutes BETWEEN 1 AND 30),
  cancel_window_hours    integer NOT NULL DEFAULT 4 CHECK (cancel_window_hours >= 0),
  whatsapp_enabled       boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  name_ar     text,
  title       text,
  title_ar    text,
  color       text NOT NULL DEFAULT '#1D6B66',
  active      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_business_idx ON staff(business_id);

CREATE TABLE services (
  id                text PRIMARY KEY,
  business_id       text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              text NOT NULL,
  name_ar           text,
  description       text,
  description_ar    text,
  duration_min      integer NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  buffer_before_min integer NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
  buffer_after_min  integer NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
  price_minor       integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  active            boolean NOT NULL DEFAULT true,
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_business_idx ON services(business_id);

CREATE TABLE staff_services (
  staff_id   text NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- Weekly hours in the business's local time. Several rows per weekday are
-- allowed, which is how breaks are expressed (09:00-13:00 and 14:00-18:00).
CREATE TABLE working_hours (
  id        text PRIMARY KEY,
  staff_id  text NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday   integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min integer NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min   integer NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX working_hours_staff_idx ON working_hours(staff_id);

CREATE TABLE time_off (
  id        text PRIMARY KEY,
  staff_id  text NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  reason    text,
  CHECK (ends_at > starts_at)
);
CREATE INDEX time_off_staff_idx ON time_off(staff_id, starts_at);

CREATE TABLE customers (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, phone)
);

CREATE TABLE bookings (
  id                  text PRIMARY KEY,
  business_id         text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id          text NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  staff_id            text NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  customer_id         text REFERENCES customers(id) ON DELETE SET NULL,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  -- the window the staff member is unavailable, buffers included
  occupied_from       timestamptz NOT NULL,
  occupied_to         timestamptz NOT NULL,
  status              text NOT NULL CHECK (status IN ('held','confirmed','completed','cancelled','no_show')),
  source              text NOT NULL DEFAULT 'web' CHECK (source IN ('web','dashboard','assistant')),
  price_minor         integer NOT NULL DEFAULT 0,
  hold_expires_at     timestamptz,
  manage_token        text NOT NULL UNIQUE,
  locale              text NOT NULL DEFAULT 'ar',
  notes               text,
  reminder_24_sent_at timestamptz,
  reminder_2_sent_at  timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (occupied_from <= starts_at AND occupied_to >= ends_at)
);
CREATE INDEX bookings_business_time_idx ON bookings(business_id, starts_at);
CREATE INDEX bookings_staff_time_idx ON bookings(staff_id, starts_at);
CREATE INDEX bookings_held_idx ON bookings(hold_expires_at) WHERE status = 'held';

-- The double-booking guard. Two rows for the same staff member conflict when
-- their occupied ranges overlap, unless one of them is cancelled or a no-show.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(occupied_from, occupied_to, '[)') WITH &&
  ) WHERE (status IN ('held', 'confirmed', 'completed'));

CREATE TABLE notifications (
  id          text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id  text REFERENCES bookings(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('whatsapp','email')),
  kind        text NOT NULL CHECK (kind IN ('confirmation','reminder_24h','reminder_2h','cancellation','reschedule')),
  recipient   text NOT NULL,
  body        text NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent','failed','simulated')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_business_idx ON notifications(business_id, created_at DESC);
`,
  },
];
