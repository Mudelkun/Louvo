-- Accounts, and the credits that hang off them.
--
-- Three absences, and each is a decision rather than an omission.
--
-- **No session table.** Signing in *adopts the device* — `devices.user_id`, the
-- column 003 put there on day one and left unread. The phone already holds a
-- 32-byte secret in its keystore and already sends it on every request; issuing
-- a second bearer token of the same strength alongside it would double the
-- surface without proving anything the first one does not. Signing out is
-- `update devices set user_id = null`.
--
-- **No money in here.** `price_cents` is recorded for reconciliation and nothing
-- reads it to decide anything. What a pack costs is the *store's* answer, quoted
-- in the user's own currency by StoreKit and Play Billing, and a second price in
-- this database is a second answer waiting to disagree with the first. What we
-- own is the credits per product, which is why `credit_products` holds a count
-- and no amount.
--
-- **No trust in the client.** Nothing the phone sends decides a balance. It
-- reports which anchors it has and which product it bought; the balance is
-- computed here, and a purchase is granted from RevenueCat's webhook rather than
-- from the app saying a purchase happened.

-- ---------------------------------------------------------------------------
-- Who
-- ---------------------------------------------------------------------------

-- An account exists to hold purchased credits across devices, and holds as close
-- to nothing else as the feature allows. `email` is denormalised from whichever
-- identity supplied it — Apple's private relay address counts and is stored as
-- given — and is deliberately *not* unique here: uniqueness belongs to
-- `user_identities`, which is the table that actually decides whether two
-- sign-ins are the same person.
create table if not exists users (
  id           text primary key,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per way of proving you are this user.
--
-- `subject` is the provider's own stable id — Apple's `sub`, Google's `sub`, and
-- for email the normalised address itself. Never the email for Apple or Google:
-- both let a user change or hide the address, and an identity keyed on something
-- mutable is an identity that silently becomes somebody else's.
create table if not exists user_identities (
  provider   text not null,
  subject    text not null,
  user_id    text not null references users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  primary key (provider, subject),
  constraint user_identities_provider_domain check (provider in ('apple', 'google', 'email'))
);

create index if not exists user_identities_user_idx on user_identities (user_id);

-- Email sign-in: one row per address with a code in flight.
--
-- The code is stored as a hash for the same reason the device secret is — a
-- readable code in a table is a readable code in a backup. `attempts` is the
-- brute-force ceiling: six digits is a million guesses, and an unbounded retry
-- loop gets through rather a lot of them.
create table if not exists email_codes (
  email      text primary key,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The free allowance
-- ---------------------------------------------------------------------------

-- What a *device* is, for the purpose of never handing out the free two twice.
--
-- `devices.id` cannot answer this alone. It is the hash of a keystore secret,
-- which on iOS survives a reinstall (Keychain items outlive the app that wrote
-- them) and on Android does not (the Keystore is cleared with the package). So
-- Android reports a second anchor — `ANDROID_ID`, stable per signing key and
-- device, reset only by a factory reset — and the allowance hangs off anchors
-- rather than off the device row.
--
-- The id is a salted hash. A raw `ANDROID_ID` is a device identifier and there
-- is no reason for this database to hold one: what an allowance needs is
-- equality, and a hash has that.
--
-- What this does not survive, stated plainly rather than implied: a factory
-- reset, a restore-as-new, or a second phone. Those are not defects to be fixed
-- here — the answer to a determined reinstaller is App Attest and Play
-- Integrity, and at roughly five cents a generation that arms race costs more
-- than it saves.
create table if not exists install_anchors (
  id           text primary key,
  kind         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint install_anchors_kind_domain check (kind in ('device', 'android_id'))
);

create table if not exists device_anchors (
  device_id  text not null references devices (id) on delete cascade,
  anchor_id  text not null references install_anchors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, anchor_id)
);

create index if not exists device_anchors_anchor_idx on device_anchors (anchor_id);

-- Two free generations, per anchor, forever.
--
-- `held` is the reservation an in-flight job holds: taken at submit, turned into
-- `used` when the preview lands, given back when it does not. A device with
-- several anchors holds against *all* of them and its remaining allowance is the
-- minimum across them, so linking a fresh install to a known anchor can only
-- ever reduce what it is owed. That direction is the whole point.
create table if not exists free_allowance (
  anchor_id  text primary key references install_anchors (id) on delete cascade,
  granted    integer not null default 2,
  used       integer not null default 0,
  held       integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint free_allowance_bounds check (used >= 0 and held >= 0 and used + held <= granted)
);

-- ---------------------------------------------------------------------------
-- Purchased credits
-- ---------------------------------------------------------------------------

-- The balance, as one row moved by compare-and-set.
--
-- Same shape as the queue claim in `jobs.ts`: `set balance = balance - 1 where
-- user_id = $1 and balance > 0` produces one winner at any isolation level and
-- cannot go negative, which is the entire requirement. `credit_ledger` is the
-- history; this is the answer.
--
-- A balance derived by summing the ledger was the alternative and is the wrong
-- shape here: spending a credit is on the hot path of every generation, and a
-- sum over an append-only table is a scan that grows with the user's history.
create table if not exists credit_balances (
  user_id    text primary key references users (id) on delete cascade,
  balance    integer not null default 0,
  held       integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint credit_balances_bounds check (balance >= 0 and held >= 0)
);

-- Append-only, and the only place that answers "why does that number say that".
--
-- `user_id` and `anchor_id` are both nullable and both may be set: a free
-- generation has an anchor and no user until the day that device signs in.
create table if not exists credit_ledger (
  id          bigserial primary key,
  user_id     text references users (id) on delete set null,
  anchor_id   text,
  device_id   text,
  -- grant | purchase | hold | spend | release | revoke | adjustment
  kind        text not null,
  -- Which pot moved. The brief asks that we always know where a generation came
  -- from; this is that answer, recorded per movement rather than inferred later.
  source      text not null,
  delta       integer not null,
  job_id      text,
  purchase_id text,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint credit_ledger_source_domain check (source in ('free', 'paid'))
);

create index if not exists credit_ledger_user_idx on credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_job_idx on credit_ledger (job_id);

-- What a product is worth, in credits.
--
-- A row rather than a constant, for the reason the catalog is a row: adding the
-- 50-pack somebody asks for should be an insert and a store listing, not an app
-- release. The *price* is not here — see the header.
create table if not exists credit_products (
  id         text primary key,
  credits    integer not null,
  badge      text,
  sort_order integer not null,
  published  boolean not null default true,
  constraint credit_products_credits_positive check (credits > 0)
);

insert into credit_products (id, credits, badge, sort_order) values
  ('com.luvoai.luvo.credits.5',  5,  null,         1),
  ('com.luvoai.luvo.credits.10', 10, null,         2),
  ('com.luvoai.luvo.credits.20', 20, 'best_value', 3)
on conflict (id) do nothing;

-- One row per granted purchase, and the idempotency record for the webhook.
--
-- `user_id` is nulled rather than cascaded when an account is deleted: the
-- account has to go when its owner asks, and the fact that a transaction was
-- honoured has to outlive it, or a refund six weeks later has nothing to
-- reconcile against.
create table if not exists purchases (
  id                   text primary key,
  user_id              text references users (id) on delete set null,
  store                text not null,
  product_id           text not null,
  credits              integer not null,
  price_cents          integer,
  currency             text,
  store_transaction_id text not null,
  event_id             text,
  environment          text,
  status               text not null default 'granted',
  created_at           timestamptz not null default now(),
  constraint purchases_status_domain check (status in ('granted', 'revoked'))
);

-- The two guards that make a replayed webhook a no-op rather than free credits.
-- RevenueCat retries on any non-2xx, so a replay is an expected path here rather
-- than a defence against an attacker.
create unique index if not exists purchases_transaction_idx on purchases (store, store_transaction_id);
create unique index if not exists purchases_event_idx on purchases (event_id);

-- ---------------------------------------------------------------------------
-- The charge on a job
-- ---------------------------------------------------------------------------

-- What this generation is paying with, carried on the job itself.
--
-- `charge_settled` is the compare-and-set target that makes settling idempotent:
-- every terminal transition moves it from null to 'spent' or 'refunded' in the
-- same transaction that sets the status, and a second attempt updates nothing.
-- That is the credit half of the rule 003 wrote for the photograph, and
-- `unsettledCharges()` is the assertion that keeps it true.
--
-- `charge_anchors` is an array because a device holds against every anchor it
-- has — see `free_allowance`.
alter table preview_jobs add column if not exists charge_source  text;
alter table preview_jobs add column if not exists charge_user_id text;
alter table preview_jobs add column if not exists charge_anchors text[];
alter table preview_jobs add column if not exists charge_settled text;
