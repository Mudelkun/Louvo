# Hairify catalog API

Phase 2, first slice: **hairstyle storage and retrieval**. Nothing else — no accounts, no
favourites, no server-side generation. The mobile app reads its catalog from here instead of
from a bundled TypeScript file, and its mannequin renders from a CDN instead of from the app
binary.

```
mobile app  ->  this API  ->  Postgres (metadata)
                          ->  R2 + CDN (imagery)
```

Why it is shaped this way, what was measured, and why R2 rather than S3 or a Railway volume:
[`docs/catalog-architecture.md`](../docs/catalog-architecture.md).

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

Everything is a public `GET`. There is nothing in the catalog that is not already on every
phone that has the app, so there is no auth to add yet — and writes do not go through HTTP at
all, they go through the publish script against the database.

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

## Deploying to Railway

Two services in one project: **Postgres** (from the template) and this directory.

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Health check path | `/health` |
| Variables | `DATABASE_URL=${{Postgres.DATABASE_URL}}` |

Use the **internal** database host for the service (`postgres.railway.internal`) — no egress
charge and no TLS — and the public proxy host from a laptop when publishing. `src/db.ts`
picks the right SSL mode from the hostname.

Migrations are not run on boot. Run `npm run migrate` against the public host before the
first deploy: a process that migrates on start races itself the moment there are two
replicas, and a failed migration inside a health check is a very confusing outage.

## Layout

```
migrations/001_catalog.sql   the schema, commented
src/env.ts                   config, validated at boot
src/db.ts                    the pool
src/types.ts                 the wire shape — a deliberate mirror of src/api/types.ts
src/catalog.ts               nine selects, assembled and cached on the revision
src/hairstyles.ts            filtering, ordering, recommendations
src/routes.ts                the endpoints
src/index.ts                 Fastify bootstrap
scripts/migrate.mjs          apply migrations/*.sql, once each
scripts/publish-catalog.mjs  the publish command
scripts/lib/metadata.mjs     the catalog -> SQL writers (importable, so they can be checked)
scripts/lib/media.mjs        PNG -> WebP, and why masks are lossless
scripts/lib/r2.mjs           SigV4 against any S3-compatible endpoint
scripts/check-roundtrip.mjs  the check above
```

`src/types.ts` and `src/hairstyles.ts` are deliberate mirrors of `src/api/types.ts` and the
filtering in `src/api/client.ts`, in the same way `scripts/lib/variants.mjs` mirrors
`src/lib/hairTypes.ts`. Neither side imports the other; both are kept honest by
`npm run check`. If they ever need to be genuinely shared, the move is a published package —
not an import across the directory boundary.
