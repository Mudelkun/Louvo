-- Preview generation: devices, and the job queue behind them.
--
-- Two things are deliberately absent from this schema and both are the point.
--
-- **No image data.** Same rule as 001: not one byte of a photograph or a
-- preview lives in Postgres. `photo_key` and `result_key` are object keys in a
-- *private* transient bucket, and both columns are nulled the moment the object
-- behind them is deleted — so a row that has been scrubbed cannot even name what
-- it used to point at. The user's photograph is deleted as soon as the model is
-- finished with it; the result is deleted as soon as the device has collected
-- it. See docs/preview-generation.md.
--
-- **No accounts.** A device is a random secret the phone generated and never
-- shows anyone, stored here only as a hash of itself, exactly the way a password
-- would be. `user_id` is the seam for the day real accounts exist; nothing reads
-- it yet.

create table if not exists devices (
  -- sha256 of the device's secret, hex. The secret itself is never sent to us
  -- in a form we store: a stolen database row cannot be replayed as a device.
  id           text primary key,
  -- Expo push token. Null until the user grants notification permission, and
  -- nulled again when Expo tells us it has stopped working.
  push_token   text,
  push_platform text,
  -- Null until accounts exist. Present from day one so adopting a device into an
  -- account is an update rather than a migration of the job table.
  user_id      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- The job queue.
--
-- A table rather than Redis, claimed by compare-and-set on `status`. The queue
-- is the job row itself, so there is no state in which a job exists in one and
-- not the other, and the whole system is inspectable with a select. See
-- docs/preview-generation.md for the throughput arithmetic and for when this
-- stops being enough.
create table if not exists preview_jobs (
  id              text primary key,
  device_id       text not null references devices(id) on delete cascade,

  -- awaiting_upload -> queued -> running -> ready -> collected
  --                                      \-> failed
  --                 (any of the first four) -> cancelled
  status          text not null,

  -- What to generate. Resolved against the live catalog at submit time rather
  -- than stored resolved, so a re-publish cannot leave a queued job pointing at
  -- a render that no longer exists.
  hairstyle_id    text not null,
  gender          text not null,
  hair_type       text,
  length_id       text,
  color_id        text,

  -- The photograph's own dimensions, measured on the device. The only thing we
  -- ever learn about the image itself, and it exists so the model can be asked
  -- for the photograph's own shape — see src/lib/imageSize.ts.
  photo_width     integer,
  photo_height    integer,

  -- Private object keys. Nulled when the object is deleted; see the header.
  photo_key       text,
  result_key      text,
  result_width    integer,
  result_height   integer,

  -- What the generator actually did, for support and for the app's own honesty
  -- about which render it was shown.
  variant         text,
  views           text[] not null default '{}',
  fal_request_id  text,
  fal_model       text,
  -- Kept rather than rebuilt from the model name. fal's queue puts a sub-path
  -- model (`openai/gpt-image-2/edit`) under its *base* path for status and
  -- result, so a url derived from the model string points at nothing. Both
  -- sibling clients in this repo carry the same warning.
  fal_status_url  text,
  fal_response_url text,

  attempts        integer not null default 0,
  error           text,
  error_code      text,

  -- One in-flight job per device is enforced in the claim query rather than
  -- here: it is a scheduling rule, not an invariant, and it has to be able to
  -- change with the fal plan.
  idempotency_key text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  ready_at        timestamptz,
  -- When the result is deleted whether or not anyone collected it. The device is
  -- where a preview lives permanently; this is only the hand-off window.
  expires_at      timestamptz,
  -- A claimed job whose worker died is re-claimable after this passes.
  lease_until     timestamptz
);

-- The claim query's index: status first, then age.
create index if not exists preview_jobs_claim_idx on preview_jobs (status, created_at);
-- The app's own list, newest first.
create index if not exists preview_jobs_device_idx on preview_jobs (device_id, created_at desc);
-- The sweeper's.
create index if not exists preview_jobs_expiry_idx on preview_jobs (expires_at);
-- A retried submit must not become a second generation, and a second generation
-- is real money. Nulls are distinct in Postgres, so jobs without a key are
-- unaffected.
create unique index if not exists preview_jobs_idempotency_idx
  on preview_jobs (device_id, idempotency_key);
