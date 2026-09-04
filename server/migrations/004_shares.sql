-- Sharing, and the referral loop behind it.
--
-- A shared look is meant to be a small advertisement for the app, so the thing
-- that has to be storable is *the link* — not the picture. Three tables and one
-- absence:
--
-- **No image, again.** A share link names a hairstyle, not a photograph. The
-- picture the recipient sees on the landing page is the catalog's own mannequin
-- render of that cut — a public, CDN-hosted, immutable object that is identical
-- for every user who shared it. The user's face is on the image they posted, to
-- the app they chose, and it never passes through here. That is the same rule as
-- 003 arrived at from the other direction: 003 deletes the photograph as soon as
-- the model is done with it, and this one never receives it at all.
--
-- **A code, not a row id.** `share_links.code` is random and short enough to
-- read out loud. It appears in urls, in a Play Store `referrer` parameter and in
-- other people's chat histories, so it is deliberately not derived from a device
-- id, a look id or a sequence — none of which should be enumerable from a link
-- somebody forwarded.

create table if not exists share_links (
  -- base62, 10 characters. Unguessable enough that a link is not a directory.
  code            text primary key,

  -- Who made it. Nulled rather than cascaded on device deletion: the link keeps
  -- working for everyone who already has it, which is the whole point of it.
  device_id       text references devices(id) on delete set null,

  -- What it points at. The name is denormalised on purpose — the landing page
  -- and the OG card must render for a hairstyle that has since been unpublished,
  -- and a dead link is a worse advertisement than a stale name.
  hairstyle_id    text not null,
  hairstyle_name  text not null,
  gender          text,
  hair_type       text,
  length_id       text,

  -- Which app the sharer picked, when they picked one before the link was made.
  channel         text,

  -- The sharer's own reference for this look, so a retried create returns the
  -- link it already made rather than a second one. Same role as
  -- `preview_jobs.idempotency_key`, and for the same reason: a duplicate here is
  -- not a duplicate charge but it is a duplicate row in the funnel.
  client_ref      text,

  -- The counters the funnel is actually read from. Kept on the row rather than
  -- computed from share_events every time: the landing page is the hot path and
  -- an `update ... set opens = opens + 1` is one statement.
  opens           integer not null default 0,
  installs        integer not null default 0,
  signups         integer not null default 0,

  created_at      timestamptz not null default now(),
  last_opened_at  timestamptz
);

create index if not exists share_links_device_idx on share_links (device_id, created_at desc);

-- A retried create must not mint a second code for the same look, or the funnel
-- counts one share as two. Nulls are distinct in Postgres, so links made without
-- a client reference are unaffected.
create unique index if not exists share_links_client_ref_idx
  on share_links (device_id, client_ref);

-- The event log.
--
-- Deliberately append-only and deliberately thin: a name, an optional code, an
-- optional device, and a small JSON blob for whatever the event is about. There
-- is no analytics vendor here and no plan for one — the questions this feature
-- has to answer (how many shares, on which platform, how many opens per share,
-- how many of those became installs) are four group-bys over this table.
--
-- What is *not* here: anything identifying a person. `device_id` is already only
-- a hash of a secret a phone generated about itself, and it is nullable because
-- the most important event in the funnel — a link being opened — happens on
-- somebody else's browser, before they have an app or a device row at all.
create table if not exists share_events (
  id         bigserial primary key,
  name       text not null,
  code       text,
  device_id  text,
  channel    text,
  platform   text,
  props      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists share_events_name_idx on share_events (name, created_at desc);
create index if not exists share_events_code_idx on share_events (code, created_at desc);

-- Which share brought this device in.
--
-- One row per device, written once and never overwritten: attribution belongs to
-- the *first* link a device ever arrived on, so a user who later opens a friend's
-- link does not re-attribute themselves away from whoever actually brought them.
-- `signup_at` is the seam for the day accounts exist — nothing writes it yet,
-- and that is recorded honestly rather than faked.
create table if not exists share_attributions (
  device_id      text primary key references devices(id) on delete cascade,
  code           text not null references share_links(code) on delete cascade,
  -- 'deep_link' when the app was already installed and the OS handed us the
  -- link; 'referrer' when a store install carried the code through. Stored
  -- because they are different claims and only one of them is an install.
  source         text not null,
  attributed_at  timestamptz not null default now(),
  signup_at      timestamptz
);

create index if not exists share_attributions_code_idx on share_attributions (code);
