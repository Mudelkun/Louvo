-- Sign-in on the web, and the ceiling that makes an anonymous preview countable.
--
-- Four small changes and one new pair of tables, all of them in service of one
-- sentence: **a browser that clears its storage must not get another free
-- generation.**
--
-- The honest starting point is that this cannot be reached by identifying the
-- browser. `localStorage`, cookies and IndexedDB are cleared by the same action
-- and absent in the same private window, and the only thing that survives all of
-- it is a fingerprint — which `anchors.ts` refuses, which both stores forbid,
-- and which denies free generations to people who never had any.
--
-- So the enforcement is not an identity. The allowance still hangs off the
-- anchor the client presents, exactly as it does on a phone; what is added is a
-- **ceiling** on how much one network-and-device-class may consume anonymously
-- in a window, whatever it calls itself. Clearing storage still mints a new
-- device. It just stops being a way to mint a new allowance.

-- ---------------------------------------------------------------------------
-- Clerk
-- ---------------------------------------------------------------------------

-- A fourth provider, verified the way the other three are: signature against the
-- issuer's published JWKS, then issuer, audience and expiry, via `jose`. The
-- subject is Clerk's own user id, which is stable and cannot be changed by the
-- user — never the email, for the reason `005` gives at length.
alter table user_identities drop constraint if exists user_identities_provider_domain;
alter table user_identities add constraint user_identities_provider_domain
  check (provider in ('apple', 'google', 'email', 'clerk'));

-- The one-time bonus for signing in, and the compare-and-set that makes it
-- one-time.
--
-- It is granted into `credit_balances` rather than as another install anchor,
-- and that is forced rather than chosen: `allowanceFor()` takes the **minimum**
-- across a device's anchors, deliberately, so that linking an identity can only
-- ever reduce what a device is owed. Rewarding a sign-in with an anchor would
-- award zero. The balance is the only pot that can go up.
--
-- `where signup_bonus_granted_at is null` is the same idempotency shape
-- `preview_jobs.charge_settled` uses: the second attempt updates no rows, so a
-- double-submitted sign-in, a retried adopt and two racing tabs are all safe.
alter table users add column if not exists signup_bonus_granted_at timestamptz;

-- A bonus is neither free allowance nor money taken, and recording it as either
-- makes the ledger lie the first time anybody sums it for revenue.
alter table credit_ledger drop constraint if exists credit_ledger_source_domain;
alter table credit_ledger add constraint credit_ledger_source_domain
  check (source in ('free', 'paid', 'bonus'));

-- ---------------------------------------------------------------------------
-- The anonymous ceiling
-- ---------------------------------------------------------------------------

-- A browser's device secret lives in `localStorage`, which is not a keystore.
-- The anchor kind records that, so a browser's free allowance can differ from a
-- phone's without anything having to guess later which it was looking at.
alter table install_anchors drop constraint if exists install_anchors_kind_domain;
alter table install_anchors add constraint install_anchors_kind_domain
  check (kind in ('device', 'android_id', 'web'));

-- One row per network-and-device-class, per window.
--
-- The id is a salted hash of the client IP, a *coarse* user-agent class (browser
-- family, OS family, major versions — never the raw string) and the accepted
-- language. Three deliberately low-entropy signals: enough to tell an iPhone
-- from a MacBook from an Android behind one router, which is the case that
-- matters because several people in a house share one address; nowhere near
-- enough to recognise a person, which is the case that must not be built.
--
-- Two properties keep this a rate limit rather than a fingerprint, and both are
-- load-bearing:
--
-- - **It is never consulted for a signed-in device.** Once there is an account,
--   the account is the identity and this table is not read at all.
-- - **Exhausting it asks for a sign-in; it does not refuse.** A false positive —
--   two identical phones on one wifi — costs somebody a free sign-in, not their
--   first preview. That is what lets the cap be set low enough to be worth
--   having.
--
-- The window is fixed rather than sliding: `window_start` is reset by the same
-- statement that reads it, so there is no sweeper and no cron. `last_seen_at` is
-- what a retention job would delete on.
create table if not exists anon_buckets (
  id            text primary key,
  window_start  timestamptz not null default now(),
  -- Anonymous generations consumed in the current window. A counter rather than
  -- a count, because this one is the *enforcement*: it moves by compare-and-set
  -- (`set generations = generations + 1 where generations < $cap`), which is the
  -- same shape the queue claims rows with and the only shape that cannot let two
  -- simultaneous submissions both pass a cap of one.
  generations   integer not null default 0,
  -- Throttles the alert to one per bucket per window, so a busy office is
  -- reported once rather than every few minutes.
  alerted_at    timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint anon_buckets_bounds check (generations >= 0)
);

create index if not exists anon_buckets_last_seen_idx on anon_buckets (last_seen_at);

-- Which device secrets a bucket has presented, which is the abuse *signal* as
-- distinct from the generation count that is the abuse *limit*. One person with
-- one browser is one device; nine devices from one bucket in a day is somebody
-- clearing storage in a loop, and that is what is worth an email.
--
-- Counted with `count(*)` rather than maintained as a column, and that is a
-- correctness decision rather than a stylistic one. Detecting a *newly* seen
-- device would mean reading whether `insert ... on conflict do nothing` affected
-- a row — and `pg-mem` returns the conflicting row from `returning` where real
-- Postgres returns none, so a counter built on it would be right in production
-- and wrong in the test, which is the worst of the two available bugs. A count
-- over the primary key needs no such signal and cannot drift.
--
-- Rows are scoped to the window by `created_at`, so a reset window does not
-- inherit yesterday's devices, and `delete where created_at < window_start` is
-- the whole of the cleanup.
create table if not exists anon_bucket_devices (
  bucket_id  text not null references anon_buckets (id) on delete cascade,
  device_id  text not null,
  created_at timestamptz not null default now(),
  primary key (bucket_id, device_id)
);
