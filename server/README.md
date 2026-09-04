# Hairify API

Two things, sharing a database and a deployment.

**The catalog** — hairstyle storage and retrieval. The mobile app reads its catalog from here
instead of from a bundled TypeScript file, and its mannequin renders from a CDN instead of from
the app binary.

**Preview generation** — the on-demand path. The app submits a job, the photograph goes straight
to a private bucket, a worker runs the model, and the finished preview is handed to the phone and
then deleted here.

Still absent: accounts, favourites, sharing.

```
mobile app  ->  this API  ->  Postgres (metadata + jobs)
                          ->  R2 + CDN     (catalog imagery, public, immutable)
                          ->  R2 private   (photographs and results, transient)
            ->  worker    ->  fal.ai
```

Why the catalog is shaped this way, what was measured, and why R2 rather than S3 or a Railway
volume: [`docs/catalog-architecture.md`](../docs/catalog-architecture.md). Why the preview
pipeline is shaped this way, and what "we do not store your photo" is precise about:
[`docs/preview-generation.md`](../docs/preview-generation.md).

## The short version

- **Metadata** — hairstyles, categories, hair types, lengths, colours, the hairstyle × hair
  type matrix — lives in Postgres.
- **Imagery** lives in R2 as WebP, keyed by the first 128 bits of the SHA-256 of its own bytes
  and served `immutable` for a year. Nothing is ever invalidated; a changed render is a new URL.
- **`GET /v1/catalog`** returns both: the metadata plus a manifest of every render URL,
  49.1 KB gzipped for today's 908 slots.
- **No image bytes are in Postgres.** The reasoning is in the doc; the short version is that
  it would put a CDN's job inside a connection pool.

## Running it locally

```bash
cd server
npm install
cp .env.example .env          # fill in DATABASE_URL at least

npm run migrate               # apply migrations/*.sql
npm run migrate -- --status   # what has and has not been applied

npm run publish:dry           # transcode + report; uploads nothing, writes nothing, free
npm run publish               # metadata into Postgres, imagery into R2

npm run dev                   # tsx watch, http://localhost:8080
                              # reads server/.env then the repo root .env.local
npm run typecheck
npm run check                 # the round-trip check, see below
```

Then point the app at it and restart the dev server — `EXPO_PUBLIC_*` is inlined at bundle
time, so a variable added to a running server is not in the running app:

```bash
# .env.local, in the repo root
EXPO_PUBLIC_API_URL=http://localhost:8080
```

With that unset the app behaves exactly as it did in phase 1: `mockCatalog` and the bundled
renders. Settings says which of the two you are looking at, and distinguishes a live catalog
from a cached one.

## Endpoints

| | |
| --- | --- |
| `GET /health` | Liveness *and* readiness — it touches the database, so a process that cannot reach Postgres reports itself unhealthy rather than serving 500s. Railway's health check path. |
| `GET /v1/catalog` | Everything: metadata, colours, highlights, the render manifest and the hair-type examples. The only call the app makes. ETagged and gzipped; `?fresh=1` bypasses the process cache. |
| `GET /v1/hairstyles` | A filtered slice. `gender`, `hairType`, `category`, `sort`, `q`, `tag`, `limit`. Metadata only, no manifest. |
| `GET /v1/hairstyles/:id` | One hairstyle plus its own renders, nested the same way as the full manifest. |
| `GET /v1/hairstyles/:id/recommendations` | "More styles for you". |

Everything above is a public `GET`. There is nothing in the catalog that is not already on
every phone that has the app, so there is no auth to add — and catalog writes do not go through
HTTP at all, they go through the publish script against the database.

The preview routes are the opposite: every one needs a device, and the device is a secret the
phone generated and keeps in its keystore. It arrives as `Authorization: Device <secret>` and we
store only its SHA-256 (`src/devices.ts`). All of them answer 503 `previews_unconfigured` if the
deployment has no bucket and no generator key, which is what a catalog-only deployment is.

| | |
| --- | --- |
| `POST /v1/previews` | Creates a job and returns a **presigned PUT url** for the photograph. No image bytes go through this process, ever. Takes an `idempotencyKey`, because a retried submit must not become a second charge. |
| `POST /v1/previews/:id/ready` | The upload landed. The object is `HEAD`ed rather than trusted — a client reporting success on a failed PUT would otherwise burn a concurrency slot to have fal tell us the url 404s. |
| `GET /v1/previews` | Everything this device has in flight. How a restarted app finds its work. |
| `GET /v1/previews/:id` | Status, stage, queue position, and a short-lived signed download url once it is ready. `no-store`. |
| `POST /v1/previews/:id/collected` | **The delete.** The phone has the preview; ours is removed and the row can no longer name it. Idempotent. |
| `DELETE /v1/previews/:id` | Cancel, and mean it: fal is asked to stop, the photograph is deleted at once, and a result that arrives anyway is discarded rather than stored. A generation already rendering may still be billed — that is fal's behaviour, not a shortcut here. |
| `POST /v1/devices/push` | Register (or clear) an Expo push token. |

## Preview generation

```bash
# one-time: a SECOND R2 bucket, private, no public domain, no CDN in front of it
#   PREVIEW_BUCKET=hairify-transient
# plus FAL_KEY. Both go in server/.env — see .env.example.

npm run api      # from the repo root: the API, watching
npm run worker   # from the repo root: the worker, watching
```

The worker is a separate process and a separate Railway service. It is the only thing that holds
the generator key and the only thing that ever touches an image. One tick recovers abandoned
claims, polls everything at fal, fills the free slots and sweeps; every step is driven by
Postgres, so two workers is a configuration change and killing one loses nothing.

**`FAL_MAX_INFLIGHT` is not a safety margin.** It is the account's real concurrency limit, which
fal sets from credits purchased in the last four weeks — 10 at $10, 40 at $1,000+. Submitting past
it buys rejections rather than throughput. Raise it when the plan is raised, and not before.

Two operational notes worth knowing before the first burst:

- A queue of 1,500 at ten concurrent takes about **two hours** to drain and costs about **$80**.
  Nothing crashes; people wait, and `GET /v1/previews/:id` tells them their position honestly.
- **There is no quota yet.** The fal key used to be in the app bundle, so the blast radius of
  abuse was "rotate the key". Now this endpoint spends the money and needs no key to call it. A
  per-device daily quota and a global spend ceiling are the minimum before it is public.

## Publishing

`npm run publish` is the command the whole architecture exists for. `project.md` asks that
"new hairstyles and mannequin images can be added or replaced easily without requiring an app
update"; this is what makes that sentence true.

It reads the authored catalog from `src/api/mockCatalog.ts` (via the same
`loadCatalog()` the mannequin generators use) and the renders from `assets/mannequins/`, then:

1. upserts every hairstyle and its matrix and length rows, in one transaction;
2. transcodes each render to WebP q80 and each mask to lossless WebP;
3. uploads anything whose content hash is not already in the bucket;
4. records the URLs against the slot;
5. bumps `catalog_revision`, which is the API's cache key — so a publish reaches users
   without a redeploy and without anyone clearing anything.

Measured on the current catalog: **400.3 MB of PNG becomes 19.0 MB of WebP, a 21.1x
reduction**, at about 21 KB per slot including its mask.

It is **idempotent**. Object keys are content hashes and each row remembers the checksum of
its source PNG, so a re-run over an unchanged catalog transcodes nothing and uploads nothing.

```bash
npm run publish -- --style afro     # one hairstyle
npm run publish -- --metadata-only  # names, ordering, the matrix — no imagery
npm run publish -- --force          # re-transcode and re-upload everything

# The sources live outside the repo, so both directories are passed explicitly.
npm run publish -- --out "C:/Users/peril/OneDrive/Pictures/Hairify-mannequins"                    --examples "C:/Users/peril/OneDrive/Pictures/Hairify-hair-types"
```

`--examples` is the hair-type picker's imagery: two genders x four textures, no
masks and no colour grade, published to the same content-addressed bucket and served
as `catalog.hairTypeExamples`. A gender reaches the wire only when all four of its
types are present — the picker shows a partial set as no set, because two
photographed rows above two icon rows reads as a broken screen.

A hairstyle removed from the authored catalog is set `published = false` rather than deleted,
because a saved look references a hairstyle id and a user who saved a preview of a retired cut
should still see what it was called.

## The round-trip check

```bash
npm run build && npm run check
```

The risk in moving a catalog behind an API is not that the server falls over — it is that a
field quietly does not survive the trip. A hairstyle whose `variants` row comes back empty is
not a crash; it is a hairstyle that silently stops being offered for any hair type, on every
phone.

So `scripts/check-roundtrip.mjs` runs the real schema, the real publish writers and the real
`src/catalog.ts` assembly against an in-memory Postgres, and asserts that what comes out of
`/v1/catalog` is field-for-field what went in — including the matrix, the per-gender length
offers, the `shape` descriptor and the manifest nesting. It needs no database and no
credentials.

`npm run check` runs two more things beside it:

- **`scripts/check-previews.mjs`** walks the whole job lifecycle against the same in-memory
  Postgres — idempotent submit, the compare-and-set claim, the per-device cap, every terminal
  transition — and asserts that no settled job still names an object. That last assertion is the
  privacy promise expressed as a test: one new status, one new path out of `running`, and a
  photograph sits in a bucket with nobody looking for it.
- **`scripts/check-signing.mjs`** checks the SigV4 in `src/storage.ts` two ways, neither of which
  needs a bucket or a credential: the header-signed path must produce a signature byte-identical
  to `scripts/lib/r2.mjs`, which has been publishing the catalog for months, and the presigned
  path must match a canonical form written out here from the AWS specification rather than copied
  from the module under test. A wrong signature is not a subtle bug — it is every upload failing
  with a 403 that says nothing.
- **`scripts/sync-shared.mjs --check`** fails if `src/generated/` is behind the app modules it is
  cut from. The try-on prompt is authored English prose that the product owner edits as prose, and
  two copies that have drifted apart are two different haircuts with no test able to say which one
  was meant. Run `npm run sync:shared` and commit the result.

## Deploying to Railway

Two services in one project: **Postgres** (from the template) and this directory.

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Health check path | `/health` |
| Variables | `DATABASE_URL=${{Postgres.DATABASE_URL}}` |

For previews, a **third** service off the same directory:

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start:worker` |
| Health check | none — it is not an HTTP service |
| Variables | `DATABASE_URL`, `FAL_KEY`, `PREVIEW_BUCKET`, `R2_*` |

Separate because the two have different scaling curves: the API must answer in milliseconds under
a burst, and the worker's pace is set by fal. Scale the worker by replicas; they coordinate
through the job table and do not need to know about each other.

Use the **internal** database host for the service (`postgres.railway.internal`) — no egress
charge and no TLS — and the public proxy host from a laptop when publishing. `src/db.ts`
picks the right SSL mode from the hostname.

Migrations are not run on boot. Run `npm run migrate` against the public host before the
first deploy: a process that migrates on start races itself the moment there are two
replicas, and a failed migration inside a health check is a very confusing outage.

## Layout

```
migrations/001_catalog.sql   the catalog schema, commented
migrations/003_previews.sql  devices and the job queue
src/env.ts                   config, validated at boot
src/db.ts                    the pool
src/types.ts                 the wire shape — a deliberate mirror of src/api/types.ts
src/catalog.ts               nine selects, assembled and cached on the revision
src/hairstyles.ts            filtering, ordering, recommendations
src/routes.ts                the catalog endpoints
src/previews.ts              the preview endpoints
src/jobs.ts                  the queue: claim, transitions, and the scrub
src/worker.ts                the loop — the only process with the generator key
src/storage.ts               SigV4, including the presigning the phone uploads with
src/fal.ts                   the queue client, split into submit / status / result
src/tryOn.ts                 one job -> one fal request
src/reference.ts             which render the model is shown — mirrors the app's matrix read
src/devices.ts               the device secret, stored as a hash
src/push.ts                  Expo push
src/generated/               copies of the authored prompt and size arithmetic — do not edit
src/index.ts                 Fastify bootstrap
scripts/migrate.mjs          apply migrations/*.sql, once each
scripts/publish-catalog.mjs  the publish command
scripts/lib/metadata.mjs     the catalog -> SQL writers (importable, so they can be checked)
scripts/lib/media.mjs        PNG -> WebP, and why masks are lossless
scripts/lib/r2.mjs           SigV4 against any S3-compatible endpoint
scripts/check-roundtrip.mjs  the catalog check above
scripts/check-previews.mjs   the job lifecycle check above
scripts/check-signing.mjs    SigV4, against the proven signer and against the spec
scripts/sync-shared.mjs      regenerates src/generated/ from src/lib/*.ts
```

`src/types.ts` and `src/hairstyles.ts` are deliberate mirrors of `src/api/types.ts` and the
filtering in `src/api/client.ts`, in the same way `scripts/lib/variants.mjs` mirrors
`src/lib/hairTypes.ts`. Neither side imports the other; both are kept honest by
`npm run check`. If they ever need to be genuinely shared, the move is a published package —
not an import across the directory boundary.
