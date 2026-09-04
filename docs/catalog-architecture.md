# Where the hairstyle catalog lives

**Decision, 2026-09-04.** Hairstyle *metadata* moves into Postgres on Railway. Hairstyle
*imagery* moves into Cloudflare R2 behind its CDN, addressed by content hash and served
immutable. The app fetches both over HTTP through the Node API and keeps the metadata in a
local cache. The procedural drawing in `src/lib/hairShape.ts` stays exactly where it is and
becomes the offline floor.

Superseded: "the catalog is loaded once by `CatalogProvider` from `src/api/mockCatalog.ts`,
and the renders are bundled by `src/api/mannequinRenders.generated.ts`."

---

## What is actually in the app today

Measured, not estimated:

| | |
| --- | --- |
| Hairstyles | 36 |
| Renders bundled by `mannequinRenders.generated.ts` | 908 |
| Hair masks bundled beside them | 908 |
| **Bytes those `require()` calls pull into the binary** | **400.3 MB** (393.4 MB renders + 6.9 MB masks) |
| Median render | 467 KB, at 512x512 to 720x720 |
| Matrix completion | 112 of 130 style x gender x variant combinations; 61 of 64 length sheets |

So the catalog is *almost fully shot* and already weighs 400 MB. That is the number the
decision has to start from — and the first thing to say about it is that most of it is not
real.

### Most of the 400 MB is an encoding artifact, not a catalog

`scripts/lib/png.mjs` writes PNG with `deflate` level 9 and no row filtering, and PNG is the
wrong container for photographic content regardless. Re-encoding the same pixels:

| Encoding | `afro/curly/male-half` | 8-sample total | Ratio |
| --- | --- | --- | --- |
| PNG as shipped | 415.4 KB | 3778.6 KB | 1x |
| PNG, adaptive filters, effort 10 | 214.6 KB | — | 1.9x |
| **WebP q80** | **19.5 KB** | **135.2 KB** | **27.9x** |
| WebP q72 | 14.6 KB | 104.3 KB | 36.2x |

Masks are already small (5–7 KB) and go to **lossless** WebP — 3.9–5.7 KB — because a lossy
mask fringes at the hairline, and the mask's whole job is to keep the colour grade off the
mannequin.

**There is no thumbnail tier, and that is a finding rather than an omission.** The obvious next
move is a small derivative for the browse grid, so a card does not pull a full render. It does
not exist here because the sources are already barely big enough for the grid:
`CARD_WIDTH` in `CatalogBrowser.tsx` is `(width - 56) / 2`, about 167pt, which is **501 physical
pixels** on a 3x phone — against sources of 512x512 to 720x720. The hero on the style screen
(`HERO_ART`) is about 218pt, or 655px. Downscaling for the grid would visibly soften the cards
to save 14 KB. So one derivative per slot, at native size, plus its mask: about **22 KB**.

If the generators are ever re-pointed at a larger frame — the length sheets already shoot at 2K
for exactly this reason — a 512px grid tier becomes worth adding, and it is one more column on
`renders` plus one more `sharp` call in the publish script.

Run over the whole catalog rather than a sample — `npm run publish:dry` does exactly this and
costs nothing — it comes to **400.3 MB of PNG for 19.0 MB of WebP, a 21.1x reduction**, at
21.4 KB per slot including its mask.

The honest version of the headline is therefore: **the whole catalog is 19 MB of imagery, and we
are shipping it as 400 MB.** Transcoding is worth doing whichever storage option wins, and it
changes the terms of the argument — a 19 MB bundle is not obviously unshippable.

**So bundle size does not decide this on its own.** It is a real cost, and it is the one the
question was asked about, but it is not the load-bearing reason.

---

## The four options

### 1. Keep everything as app assets

Metadata in `mockCatalog.ts`, imagery in `assets/mannequins/`, both compiled in.

**For.** Zero infrastructure, zero latency, works on a plane, no per-image request, no cache to
reason about. First paint is instant. There is no failure mode between a user and a picture.

**Against, and this is what kills it:**

- **The spec forbids it.** `project.md`: "new hairstyles and mannequin images can be added or
  replaced easily **without requiring an app update**." `CLAUDE.md` restates it as the first
  architectural constraint. A bundled catalog means every new haircut, every re-shoot of a bad
  sheet, every popularity re-order and every seasonal set is an App Store review — a 1–3 day
  floor on a change that should take a minute.
- **The catalog is the product's inventory, and inventory changes.** 36 styles is the seed. The
  matrix multiplies: variant x length x gender x angle. At 36 styles that is 908 slots. At 100
  it is roughly 2,500.
- **Nothing can be fixed in the field.** `CLAUDE.md` already records that "the female renders of
  every unisex style on disk are wrong and need re-shooting". Bundled, that ships broken until
  the next release.
- **Google Play's base delivery limit is 200 MB** without asset packs. At 400 MB today the app
  cannot be published as-is; at 19 MB transcoded it can, but every future style still has to fit
  inside a binary.

### 2. Metadata in Postgres, images still bundled

Fixes ordering, naming, categories and the matrix — the whole `variants` and `lengths` layer
becomes editable. Does not fix imagery, which is where the actual editorial work happens: a new
hairstyle *is* a new set of renders. Half a solution, and the half that matters less.

Worth naming because it is the cheap intermediate step, and rejecting it on purpose.

### 3. Metadata in Postgres, images in object storage behind a CDN — **recommended**

The app asks the API for a catalog; the catalog contains URLs; the phone fetches images from
the edge and caches them on disk.

**For.**

- Adding a hairstyle is a publish, not a release.
- The binary drops by 400 MB. What is left is 3.6 MB of launcher and splash art and 3.3 MB of
  hair-type picker examples — a separate generation, and out of scope for this branch.
- A phone downloads only the slots it actually looks at — about 22 KB each — instead of carrying
  all 908 of them. Today's binary contains every coily render for a user who declared straight.
- The **try-on stops uploading its own reference**. Today `assetDataUri()` base64-inlines a
  bundled PNG into every fal request: roughly 550 KB of base64 off the user's uplink, per
  preview. With a hosted render the app sends a URL and fal fetches it server-side.
- Rollback, A/B, per-region catalogs, "trending this week" — all become rows.

**Against, and how each is handled.**

| Cost | Answer |
| --- | --- |
| Images can fail to load | The procedural drawing already exists as the fallback for an *ungenerated* style. It becomes the fallback for an *unreachable* one too — same code path, no new failure UI. |
| First browse is network-bound | A card is about 22 KB (render plus mask), so a 40-style grid is about 0.9 MB once, then cached. `mannequinPreload.ts` already queues warm-ups one at a time, and it warms URLs at least as well as bundled assets. |
| Offline stops working | The catalog JSON is cached in AsyncStorage and images land in the platform image cache. A returning user offline sees what they browsed last; a first-run user offline sees drawings. This is worse than today, and it is the price. |
| More moving parts | One table for renders, one publish script, one CDN. The API is read-only. |

### 4. Images as `bytea` in Postgres — rejected

Named because the question was asked explicitly. It is the wrong place for pixels:

- Every image read takes a connection from a small pool and blocks it for the transfer.
- Image bytes land in the WAL and in every backup, so a 19 MB corpus makes backups an order of
  magnitude heavier and restores slower — for data that never changes.
- TOAST compresses already-compressed WebP for nothing and stores it out of line anyway.
- There is no ETag, no `Range`, no `immutable`, no edge. You would be rebuilding HTTP caching
  inside a Node process.
- Railway bills database storage and egress at a premium to do what a CDN does free.

Postgres holds the *pointer*. It is very good at that.

---

## Why R2 specifically

The question is not storage price. 908 slots at 21.4 KB is a **19 MB** corpus today, and maybe
55 MB at 100 styles; at $0.015/GB-month that is a tenth of a cent. Every vendor is free at this
size.

**Egress is the entire cost**, because the access pattern is one small read-only corpus fanned
out to every phone on every scroll.

Sizing a session honestly: a first browse of 40 styles is about 0.9 MB; opening a few style
screens pulls four angles plus masks plus the variant cycle, which is another megabyte or so.
Call it **2 MB per session**, most of it on the first one — after that the platform image cache
serves it, because the URLs are immutable.

At **100k MAU x 5 sessions x 2 MB ~ 1 TB/month**:

| | Storage | Egress at 1 TB | Egress at 10 TB | CDN |
| --- | --- | --- | --- | --- |
| **Cloudflare R2** | ~$0.01 | **$0** | **$0** | included |
| S3 + CloudFront | ~$0.01 | ~$85 | ~$850 | separate distribution |
| S3 direct | ~$0.01 | ~$90 | ~$900 | none — and it shows |
| Bunny.net Storage + CDN | ~$0.01 | ~$10 | ~$100 | included |
| Railway volume, served by the API | billed | ~$50 | ~$500 | none, and your API is now a file server |

R2's zero egress removes the one line item that grows with success. The gap against CloudFront
is $85/month at 1 TB and $850 at 10 TB — small money early, and it is *the* money later.

Three more reasons, in order of how much they matter:

1. **The CDN is included.** No second product, no distribution to configure, no origin access
   identity, no invalidation API to get wrong.
2. **It is S3-compatible.** The publish script signs SigV4 against an endpoint and a bucket, so
   moving to B2, Bunny or S3 later is a credential and a hostname, not a rewrite. That is what
   makes this low-regret rather than a bet on Cloudflare.
3. **Class B (read) operations are $0.36/million**, and with `immutable` caching almost every
   read is served at the edge and never reaches the bucket at all.

**Is R2 necessary?** At today's scale, no — nothing is. It is the right default because its
cost curve is flat and because leaving it is cheap if that ever stops being true.

**Rejected alternatives.** *Cloudflare Images* charges per image stored **and** per image
delivered, and sells transforms we do not need since derivatives are baked at publish time — it
is strictly more expensive here. *Supabase Storage* means a second platform beside Railway for
no gain, with billed egress. *Railway volumes* are block storage attached to one service: no
edge, billed egress, and serving static files from the API process puts image traffic in
contention with API traffic.

---

## The shape that falls out

```
authoring  (src/api/mockCatalog.ts, assets/mannequins/)
     |
     |   server/scripts/publish-catalog.mjs      <-- one command
     |     transcode -> content-hash -> upload -> upsert
     v
  R2 bucket   +   Railway Postgres
     |                  |
     |                  |  GET /v1/catalog   (ETag, gzip, ~45 KB)
     |                  v
     |            Node API on Railway
     |                  |
     v                  v
  CDN edge  <-------  mobile app  ------->  AsyncStorage cache
```

Three decisions inside that are worth stating on their own, because they are what make it work
rather than merely function.

### Content-addressed, immutable URLs

A render's key is the SHA-256 of its transcoded bytes: `r/<hash>.webp`, served
`Cache-Control: public, max-age=31536000, immutable`.

This one choice answers three questions at once. **Cache invalidation** never happens —
different pixels are a different URL, so there is no purge to run and no stale image to chase.
**Re-shooting a style** is a new object plus a metadata update; the old object stays, so
rollback is a row change. **Republishing an unchanged catalog** uploads nothing, because every
key already exists.

### The manifest ships with the catalog, not as a URL template

`GET /v1/catalog` carries the render URLs explicitly, in the same
`style -> variant -> length -> gender -> angle` shape the generated module already uses.
Measured on the live response — 36 styles, 908 slots, published to Railway and R2: **243.0 KB
raw, 49.1 KB gzipped**, revalidated with an ETag so a client that already has the current catalog
gets a 304.

Two thirds of that is URLs, which is why the object key carries **32 hex characters of the
digest rather than all 64**. Each URL appears twice per slot — the render and its mask — so the
full digest cost about 116 KB of raw JSON and bought nothing: 128 bits over a few thousand
objects that only one script can write is not a collision anyone will ever see. Trimming it took
the response from about 300 KB to 243.0 KB, and the gzipped payload from roughly 78 KB to
49.1 KB.

Deriving URLs client-side from a path template would be smaller, and would couple the app to
the storage layout — the exact coupling this change exists to remove. Explicit URLs mean the
bucket can be reorganised, split or replaced without an app release.

The threshold to watch: at about 100 styles the manifest is roughly 100 KB gzipped, still fine;
at about 300 it is 300 KB and should split into hero-only in `/catalog` plus per-style angle
sets fetched when a style screen opens. That is a client change against an endpoint that
already exists.

### The render index is data at runtime, not code at build time

`mannequinRenders.generated.ts` exists because "Metro can only bundle an asset some module
requires by a literal path". Once renders are URLs that constraint is gone, so the map becomes a
value the catalog response installs (`src/api/renderIndex.ts`). `mannequinRender()`,
`mannequinMask()`, `mannequinViews()` and `renderedVariants()` keep their signatures and read
the active index instead of the import — every caller is unchanged.

The generated module stays as the **fallback** index, which is what keeps the repo runnable with
no server and no key, exactly as it is today.

---

## What this does to features that do not exist yet

- **Accounts, favourites, saved looks.** The API already exists by then; `/me/favourites` stores
  hairstyle ids against a user, and a saved look references a render by hash rather than by a
  path that may be re-shot underneath it.
- **Server-side try-on.** The reference render is already a URL fal can fetch, so moving
  generation behind the API stops being a data-plumbing problem and becomes only a key-custody
  problem — which is the whole of phase 2.
- **Curation.** Popularity, trending and seasonal ordering are columns. A/B testing two orders is
  a query parameter.
- **Localisation.** Names, descriptions and taglines are rows, so a translation is an insert.
- **Analytics.** The API sees which styles are fetched and opened, which is the data that should
  decide what gets shot next. Today nothing sees that.

---

## Status

**Live.** Migrations applied to Railway Postgres, all 36 hairstyles published, and all 908 render
slots transcoded and uploaded to R2 — 1,816 objects, 18.8 MB. Verified end to end: a served object
hashes to the key in its own URL, which is what content addressing is supposed to guarantee. A
second publish over an unchanged catalog transcodes nothing and uploads nothing.

## What this branch built, and what it deliberately did not

Built:

- `server/` — Fastify + Postgres, five read-only endpoints, the schema in
  `migrations/001_catalog.sql`, and a round-trip check that runs the real publish writers and
  the real assembly code against an in-memory Postgres with no credentials.
- `server/scripts/publish-catalog.mjs` — the one command that puts a hairstyle in front of
  users. Idempotent, content-addressed, with a free `--dry-run`.
- App side: `src/api/renderIndex.ts` installs the catalog's imagery at runtime, and
  `src/api/catalogCache.ts` keeps the last good catalog on the device. `src/api/client.ts`
  reports which of the three sources answered, and Settings says so.

Deliberately not built, because the brief was hairstyle storage and retrieval:

- **Accounts, favourites and saved looks.** Still device-local.
- **Server-side try-on.** The fal key still ships in the app bundle. What *did* change is that
  the reference render is now a URL, so the preview request no longer base64-inlines half a
  megabyte off the user's uplink — and moving generation behind the API is now only a
  key-custody problem rather than a data-plumbing one.
- **An admin surface.** Publishing goes through the script against the database. There is
  nothing to authenticate yet because there is nothing to write over HTTP.

One loose end worth naming: **`assets/mannequins/` is still in the repo and still in the
bundle.** The render index falls back to it when no API is configured, which is what keeps a
fresh checkout runnable, and that is worth having during the transition. But it is 400 MB in
git and in every build, and once the first real publish has happened the honest next step is to
drop the `require()` map — keeping the PNGs as generator *sources* outside the app bundle. That
is a deletion, not a design decision, and it belongs in its own commit.

## The hair-type picker's examples are next, and are not this

`assets/hair-types/` is another 3.3 MB of generated imagery bundled the same way, behind
`hairTypeExamples.generated.ts`. It has exactly the same problem and exactly the same fix — a
table, a manifest, a publish — and it was left alone because it is a separate generation
(`scripts/generate-hair-type-examples.mjs`), not catalog imagery, and this branch was scoped to
hairstyles. When it moves, it should reuse `renderIndex.ts`'s pattern rather than invent a
second one.
