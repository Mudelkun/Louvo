# Preview generation

How a user's photograph becomes a preview without ever becoming a file we keep.

The catalog's architecture is in [catalog-architecture.md](catalog-architecture.md); this is the
other half — the on-demand path. They share a database, a bucket provider and a deployment, and
almost nothing else: the catalog is public, immutable and cached for a year, and this is private,
transient and deleted on sight.

---

## The constraint, and the honest version of it

Two requirements that partly fight:

1. **The user's photograph is not stored by us.** Not in Postgres, not in the CDN bucket, not in a
   backup.
2. **The job runs in the background**, so the user can close the app and be told when it is done.

If the app is closed it cannot hold the photograph and cannot hand it to anything, so for the
forty-odd seconds the model is working the image **has to be somewhere the server can reach**.
There is no design that avoids this, and it would be dishonest to write one that appeared to.

What is achievable, and what this implementation commits to:

> The photograph is **in flight, never at rest**. It goes from the phone straight into a private
> bucket with no public domain and no CDN, under a 32-byte random key, is read once by the model
> through a url that expires in minutes, and is deleted the moment the job settles — success,
> failure or cancellation alike. It is never in Postgres, never public, never in a log line, and
> after the job it is not even nameable: the column that held its key is nulled in the same
> statement that sets the final status.

The same applies to the finished preview, with one difference that is the whole point of the
feature: it has to survive until its owner comes back for it. So it is **collected** rather than
merely downloaded — the phone writes it into its own documents directory, then tells the server,
and the server deletes its copy. After that the only copy in existence is the one on the phone,
and it stays there until the user deletes it. A preview nobody collects is deleted anyway after
`PREVIEW_RETENTION_DAYS`, which is a hand-off window rather than a retention policy.

**What this does not claim.** The worker handles the bytes: it fetches the finished image from
fal and writes it to the bucket. During that moment it is in a process of ours. "No access" here
means *no retained access* — there is no standing copy, no index of who generated what image, and
nothing to hand over later. Cryptographic inaccessibility would require the phone to hold a key
the server never sees, which is not compatible with a third-party model doing the generation at
all.

---

## Shape

```
 phone                      API (Fastify)              worker              fal.ai
   │
   │ 1. POST /v1/previews  ──────►  insert job (awaiting_upload)
   │      {styleId, gender, hairType,        ├─ sign a PUT url for R2
   │       photoW, photoH, idemKey}          └─ 201 { job, upload }
   │ ◄──────────────────────────────
   │
   │ 2. PUT the photo ══════════════════════════════════►  private bucket
   │    (direct to R2 — never touches our server)
   │
   │ 3. POST /v1/previews/:id/ready ──►  HEAD the object, then status = queued
   │
   │                                    4. claim a free slot ──►
   │                                       resolve the reference render
   │                                       build the prompt
   │                                       submit ─────────────────────────►
   │                                       status = running
   │
   │                                    5. poll ◄─────────────────────────── 
   │                                       download the result
   │                                       put it in the bucket
   │                                       DELETE the photograph
   │                                       status = ready  ──►  push notification
   │
   │ 6. GET /v1/previews/:id  ──►  { status, result: { signed url } }
   │ 7. download it, then POST /:id/collected ──►  DELETE the result, status = collected
```

The load-bearing property: **no image bytes pass through the API process.** Fifteen hundred
simultaneous submissions are fifteen hundred small JSON requests and fifteen hundred HMAC
signatures. The uploads go to Cloudflare.

---

## Decisions

### Presigned urls, not an upload endpoint

`server/src/storage.ts` signs SigV4 into the query string, so the phone gets a url it may `PUT`
to and nothing else, for fifteen minutes. This is the single decision that makes the burst
requirement trivial: a multipart upload endpoint would put ~450 MB through a Node process for a
1,500-user burst, and every one of those requests would hold a connection for the length of a
phone's uplink.

The phone downscales to a 1,536px longest edge first (`preparePhoto`), which turns a 4 MB HEIC
into roughly 300 KB. The model works at about 2 megapixels, so nothing above that is anything but
upload time.

### A Postgres queue, not Redis

`preview_jobs` is the queue *and* the job record, so there is no window in which one exists
without the other and no reconciliation between two stores. Every operational question — how many
are waiting, what did this user's last one do, which are stuck — is a select. Claiming is a
compare-and-set:

```sql
update preview_jobs set status = 'running', ... where id = $1 and status = 'queued'
```

Two workers reaching for one row produce one winner and one zero-row result, at any isolation
level, without holding a lock across a round trip. The loser moves to the next candidate.

This started as `for update skip locked` inside a CTE and was changed for two reasons: the guard
above is simpler and strictly stronger for this shape, and it runs on any Postgres — including
the in-memory one `check-previews.mjs` uses. A queue whose claim path cannot be tested is a queue
with no test.

Redis and BullMQ are the upgrade past roughly 50 jobs/second sustained. At the numbers below,
that is three orders of magnitude away.

### A separate worker service

Same directory, `npm run start:worker`, deployed as a second Railway service. The API must answer
in milliseconds under a burst; the worker's pace is set by fal and a generation takes most of a
minute. Running them together means a queue drain competing with a user pressing Generate.

The worker holds nothing in memory. A claimed job that was never submitted is recovered by its
lease; a submitted one has its `request_id` in Postgres and any worker can collect it. Killing a
worker mid-generation loses the current tick and nothing else.

### Polling, not webhooks

fal will call a webhook, and above a certain size that is obviously right. **This account's
concurrency limit is 10** — fal sets it from credits purchased over the last four weeks, and the
published ceiling is 40 at $1,000+. Ten in-flight jobs polled every two seconds is five requests
a second, forever.

A webhook would add a public endpoint, an ed25519 signature to verify, a replay window, and a
delivery-failure mode that needs a polling reaper behind it anyway — the complexity of both
mechanisms to remove a load that does not exist. Revisit above ~100 concurrent.

### A device secret, not accounts

The phone mints 32 random bytes into the platform keystore and sends them as a bearer token; the
server stores only the SHA-256 of it. It identifies a *device*, not a person: a reinstall is a
new device and loses the list of jobs in flight (not the looks, which are files on the phone).
`devices.user_id` exists and is unread, so adopting a device into a real account later is an
update rather than a migration of the job table.

It proves nothing about the caller being a real copy of the app, which is what costs money once
the endpoint is public. That is App Attest and Play Integrity, and it is not built yet — see
below.

### The scrub is a state transition

Every path out of `running` nulls `photo_key` in the same statement that sets the status. There is
no ordering in which the worker can crash and leave a settled job with a photograph attached. The
sweeper exists to catch objects whose *row* was lost, not to be the mechanism —
`check-previews.mjs` asserts `unscrubbed()` is empty after walking every branch.

### Idempotency

A preview is about five cents and a phone on a bad connection retries a POST it never saw the
response to. `(device_id, idempotency_key)` is unique, the insert is `on conflict do nothing`, and
a replayed submit returns the original job with **no upload url** — re-uploading would be writing
over a photograph the queue is already reading.

Retry, by contrast, is deliberately a *new* generation with a new key. It costs money, which is
why it is a button somebody presses.

---

## The numbers

A burst of **1,500 simultaneous submissions**:

| | |
| --- | --- |
| API work | 1,500 small POSTs, 1,500 signatures, 1,500 inserts — one instance, sub-second |
| Upload traffic through us | **none** (≈450 MB direct to R2) |
| Nothing crashes; jobs **queue** | drain time = 1,500 ÷ concurrency × ~45s |
| at 10 concurrent (this plan) | ≈ **1h 52m** |
| at 20 / 30 / 40 | ≈ 56m / 37m / 28m |
| Cost of the burst | ≈ **$80** at $0.053 a preview |

The only ceiling in the design is fal's concurrency, and it is a billing setting rather than a
code change. Everything on our side scales by adding worker replicas.

**10,000 users** is the same statement: our side is a slider, the queue is money and fal's limit.

---

## Not built yet, on purpose

These are known and deliberately deferred, in the order they should be picked up.

1. **Quotas and rate limits.** Before this, the fal key was in the app bundle and the blast radius
   was "rotate the key". Now *our endpoint* spends the money and no key is needed to call it. A
   per-device daily quota, a per-IP limit and a global daily spend ceiling are the minimum before
   this is public. `FAL_MAX_INFLIGHT_PER_DEVICE` is the only limiter in place today and it caps
   concurrency, not volume.
2. **Attestation.** App Attest and Play Integrity are what make the device secret mean "a real
   copy of the app" rather than "whoever has this string".
3. **Removing `EXPO_PUBLIC_FAL_KEY` from builds**, and rotating it. The direct path in
   `src/api/tryOn.ts` is kept because it is what a checkout with no server runs on; it should not
   be what a shipped build runs on.
4. **`mask_url` on the try-on.** gpt-image re-renders the whole frame, so identity drifts a little
   every generation and prose is currently what prevents it. Confining the edit to the hair region
   is the real fix and needs hair segmentation on the user's photo.

---

## Rejected

**The photograph in a Postgres column.** Same answer as the catalog's: it bloats the WAL, the
backups and every restore, and it makes the one thing we promised not to keep the hardest thing
to delete. The database holds a key, and only until the object is gone.

**Base64 in the submit request.** It was the app's existing shape and it is the reason the API
would need to handle megabytes. It also doubles the bytes on a phone's uplink.

**Keeping the app's direct-to-fal path as the default.** The key is readable by anyone with the
binary, and the job dies when the app is closed — the two things this whole piece of work exists
to fix. It survives only as the no-server fallback.

**A retention policy instead of collection.** "We keep your preview for N days" is a simpler
sentence and a worse arrangement. Downloading first and acknowledging second means the normal
case leaves nothing behind at all, and the retention window only ever applies to a phone that
never came back.

**Automatic retries on any failure.** Two attempts, and only for errors that could plausibly go
the other way (`FalError.retryable`). A model that refuses a request will refuse it identically
forever, and an aggressive retry policy is a bill rather than a resilience feature — the same
conclusion the mannequin generators reached from the other direction.
