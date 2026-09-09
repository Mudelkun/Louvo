# Louvo on the web

A Next.js app against the same API the phone app uses. It is not a port of the
app — it is a second front end onto one backend, designed for a browser and for
the thing a browser is good at that an app store is not: being found, being
linked to, and being changed on a Tuesday afternoon.

```bash
# From the repo root, in two terminals:
npm run sandbox          # the whole backend, in memory — no Railway, no R2, no fal
npm run web:dev          # this app, on :3000, pointed at the sandbox

# Or from here:
npm install
cp .env.example .env.local
npm run dev
```

`npm run typecheck` is the check to run after changes. There is no linter
configured, the same as the rest of the repository.

---

## Why a separate app and not `expo export --platform web`

The Expo app already builds for web, and running that build would have been an
afternoon rather than a week. What it produces is a phone in a browser window:
one column, tab bar, no URLs worth sharing, no server rendering, and every
screen laid out for a 390px viewport. That is a demo, not a shopfront.

The specific things this app has that the exported one could not:

- **A URL per hairstyle, server-rendered.** `/styles/blunt-bob` returns real
  metadata with the catalogue's own render as its `og:image`, so a link into a
  chat unfurls as the haircut. A few dozen named cuts on indexable pages is the
  entire SEO case for launching on the web first, and `app/sitemap.ts` builds
  that list from the live catalogue rather than by hand.
- **A layout that uses the window.** The try-on is the home page: an upload box,
  then two questions in a dialogue, then the narrowed catalogue — rather than
  five phone screens behind a landing page. A visitor arriving from a style page
  with the cut already chosen does not walk through questions they have
  answered.
- **A different voice.** Display serif over a grotesque, dark ground, plates
  floating on it. The app is a tool somebody opens in a queue at a barber's;
  this is looked at once, deliberately, and has about four seconds.

---

## How it talks to the backend

Nothing is new on the server. Every route this app calls already existed for the
phone, including the parts that look like they would need work:

| What | Route | Note |
| --- | --- | --- |
| Catalogue | `GET /v1/catalog` | One ~45 KB gzipped document, fetched once per session |
| Balance | `GET /v1/account`, `GET /v1/credits` | Never computed locally — see below |
| Generation | `POST /v1/previews` → `PUT` to the bucket → `POST /:id/ready` | No image bytes touch the API |
| Watching | `GET /v1/previews/:id` | Polled every 2s while a job is open |
| Collecting | `POST /v1/previews/:id/collected` | Called **after** the download. This is the delete |
| Sharing | `POST /v1/shares`, `POST /v1/events` | A link names a hairstyle, never an image |
| Buying | `POST /v1/checkout/session` → Stripe's own page → `POST /v1/checkout/confirm` | Hosted checkout; no card details reach this app |

**Authentication is the device header**, `Authorization: Device <secret>`, and it
works unchanged in a browser: 32 random bytes minted on first use. The one honest
difference is where they live. On a phone that is the platform keystore, which
outlives a reinstall; here it is `localStorage`, which a private window does not
have. So **the two free previews are weaker on the web**, deliberately, because
the alternative is fingerprinting — which the mobile design explicitly refuses,
which both app stores forbid, and which denies free generations to people who
never had any. `lib/device.ts` has the full argument.

### One thing the deployment must be told

The photo upload is the only request that leaves this origin: the browser `PUT`s
straight to a presigned url on the preview bucket. A bucket with no CORS policy
answers that preflight `403 CORS not configured`, which a browser reports to
JavaScript as a bare `TypeError` with no status — and the job then sits in
`awaiting_upload` looking exactly like a slow queue.

```bash
node server/scripts/preview-cors.mjs https://your-web-origin
```

`SHARE_BASE_URL` on the API should also point at this site rather than at the API
host, or minted share links open the app's landing page instead of a style page.

---

## The shapes that must not drift

Four programs now read the same catalogue: the app, the server, the generators
and this. The repository's rule is that a *predicate* may be mirrored by hand and
kept honest by running both copies, but a *document* may not — two copies of a
privacy policy that have drifted apart are two different promises about somebody's
photograph.

`scripts/sync-contract.mjs` is that rule applied here. It copies three files into
`lib/contract/`, re-pointing only their import headers:

| Copied from | To | Why a copy |
| --- | --- | --- |
| `server/src/types.ts` | `catalog.ts` | The wire shape of `/v1/catalog`. A hand-typed fourth copy is a field that silently stops arriving |
| `src/lib/legal.ts` | `legal.ts` | Authored prose. Two privacy policies are two promises |
| `src/lib/hairShape.ts` | `hairShape.ts` | Pure geometry. A second implementation would be a second silhouette for one haircut |

**Edit the source, never the output.** `npm run typecheck` and `npm run build`
both fail on a stale copy.

`lib/hairTypes.ts` is the deliberate exception — the hairstyle × hair type
predicates, mirrored by hand, because they have to compile against this app's
types and because two implementations of "is this cut offered for type 4" can be
compared by running them.

---

## Decisions worth knowing before changing something

**`/` is the try-on, not a page about it.** There is no landing page, no
`/how-it-works` and no `/pricing` — `next.config.ts` redirects the last two,
permanently, because both were in the sitemap. The home page is
`components/home/TryOnFlow.tsx` and it moves through three *derived* states: a
photograph, two questions in `SetupDialog`, then `StyleChooser` — the catalogue
already narrowed to the answers. `/studio` is a redirect kept for links minted
before the change; `/studio/generating` and `/studio/result/[id]` are unchanged.

**The hero is real before-and-afters.** Matched pairs in `public/hero/`
(`before-1`/`after-1`, and so on), found by `app/page.tsx` reading the directory
during the static render; absent, the column falls back to catalogue plates
rather than to broken images. It is a *set* because one face answers *will this
look like me* for one person — the thumbnails under the frame are the visitor
finding the one nearest themselves — and the set should cover both genders and
the four textures. `public/hero/README.md` is the brief. `HeroCompare` is not
`<BeforeAfter>` — that one is sized for the result page and this one has to fill
a column. **It plays on its own**: a 4.3s cycle per face — park on the
photograph, reveal, hold longest on the finished cut, return — and the set
rotates, so a visitor who touches nothing sees all four in seventeen seconds — a
total that grows by 4.3s per face, and is the thing to watch as the set does. The
pointer takes over while it is over the picture and the loop stops dead;
`phaseNearest` hands it back on leave without a jump. Tapping a face pins the
set, reduced motion switches the whole thing off, and an `IntersectionObserver`
stops the loop when the hero is scrolled away. It carries `touch-action: pan-y`
so a full-height pointer target on a phone does not stop the page scrolling.

**The two questions are a dialogue.** Once answered they are furniture, so they
are not control rows sitting above the grid for ever; the grid's own filter rail
is where they are adjusted afterwards. They are raised on **every upload** — both are about the
person in the picture rather than the person at the keyboard, so a stored answer
is only good for the photograph it was given about — and **nothing arrives
pre-selected**, for the same reason plus one more: a lit tile is the easiest
thing to tap past without reading.

**Its tiles are gender signs and hair-type examples, never catalogue renders.**
Gender asks for a category, and two mannequin plates invite comparing them as
haircuts; it is Mars and Venus in blue and pink, the blue being `--color-azure`,
which exists for this control and nothing else.
Hair type is illustrated with `catalog.hairTypeExamples[gender][type]` — the set
`scripts/generate-hair-type-examples.mjs` makes, where the subject is the texture
rather than a cut. None has been generated yet, so the tiles currently draw the
straight/wavy/curly/coily diagram; generate and publish a set and the photographs
take over with no code change.
Gender has no skip because it decides which renders exist, and *all types* is one
of the four choices rather than an escape hatch, so there is no dead end in it.

**The chooser carries the catalogue's own rail, pre-set.** It offered categories
and a search and nothing else, since gender and texture were answered two
questions earlier — but that left the only way to change them a round trip
through the dialogue. `<CatalogFilters>` is shared with `/styles` and arrives
with both answers already selected; each page supplies only the frame (sticky and
bled to the gutters there, plain here). The controls write to the session, so the
summary row above the grid no longer repeats them as chips.

**A card is a link; generating happens on the style page.** A haircut has a
length, and that control is on the style page along with the four angles and the
texture chooser — generating off a grid card silently sends the anchor length
every time. `<TryOnAction>` in `StyleDetail` is the button.
`app/styles/[id]/page.tsx` reads `?length=` from its own search params rather
than with `useSearchParams`.

**With no photograph, that button takes one — on the page.** It used to link into
the home flow and carry the cut back; somebody standing on a haircut has already
done what the dialogue is for. It opens the file picker instead (`usePhotoIntake`,
shared with the hero's drop box so there is one decode, one size cap and one
refusal wording), and then generates with the length, texture and angle untouched.
Gender is the one answer still asked, as two buttons in the action itself, because
it decides which render exists; hair type is not, because *all textures* is a real
answer and its control is already on the page.

**The packs live on `/account`.** A price shown to somebody who has not yet seen
a preview is a number with nothing attached to it — the same argument the app
makes for having no paywall in its first run.

**Violet is a colour something is; pink is only ever the far end of a gradient.**
Both are measured off the launcher artwork. Pink dark enough to carry white text
is maroon and stops being the logo's pink, so solid accent surfaces are violet
and the pink is spent on the hero wash, the progress arc and the generating
frame. `app/globals.css` and, at length, `src/theme/tokens.ts`.

**`--color-plate` is `#FFFFFF` and does not follow the scheme.** Every render is
shot on flat white. A dark ground under one draws a bright rectangle of the
render's own white with the seam on the render's edge, and a tinted plate leaves
a visible square in *both* schemes. Text drawn on a plate comes from
`--color-on-plate`.

**The colour grade is drawn with an SVG `<mask>`, never `mask-image`.** CSS
`mask-image` fetches in CORS mode; the catalogue CDN sends no
`Access-Control-Allow-Origin`, so a masked `<img>` overlay loses its mask, the
element is masked out entirely, and the grade vanishes — leaving a grid with two
hair colours in it and nothing that looks broken. SVG masks paint cross-origin
content without CORS. `components/Plate.tsx` has the full note; the app's
`<Mannequin>` differs here for a real reason.

**Waiting for content is a skeleton, never a spinner** — with one exception,
`<Button loading>`, because an *action* in flight has no shape to stand in for.
A placeholder may state the layout (six cards, four angle tiles) and never the
data (`0 styles` is a claim about an answer that has not arrived).

**Nothing on the generating page invents progress.** The server reports a stage,
not a percentage; the client eases between reports, the countdown may only
ratchet *earlier*, and while a job is queued the estimate is replaced by its real
queue position. The scissors are the other kind of motion — deliberately not tied
to progress, because their job is to separate "slow" from "hung".

**The client never adjusts a balance.** No optimistic decrement on submit, no
optimistic increment on purchase. And `ready: false` is not "no credits" —
`canGenerate` is true while loading, because a paywall that flashes on a cold
start lands on people who have twenty.

**Every degraded outcome is reported.** The footer says whether the catalogue
came from the API or from this browser's offline copy; the packs on `/account` say
checkout is not open; a deployment that cannot mail a sign-in code says so in the
dialog rather than failing silently. That is the same rule `catalogSource()`,
`generationSource()` and `shareSource()` follow in the app.

---

## Sign-in

An email address and a six-digit code — `components/SignInDialog.tsx`, raised
from the header and from `/account`, opening over the page rather than at a
route. There is no separate sign-up: the code creates the account if the address
is new, and a first sign-in carries the welcome credit.

It needs one thing on the **API** side, not here:

| Server setting | What happens |
| --- | --- |
| `RESEND_API_KEY` (+ `EMAIL_FROM`) | The code is emailed. This is production. |
| `EMAIL_DEV_ECHO=true` | The code comes back in the API response, prefilled in the dialog and labelled as a development setting. Refused whenever `RESEND_API_KEY` is set. `npm run sandbox` turns it on, so a local checkout signs in with no key at all. |
| Neither | `/v1/account/email-code` answers 503 and the dialog says sign-in email is not working on this deployment. |

There is no `NEXT_PUBLIC_*` flag for sign-in and there should not be one:
`hasApi` is the whole condition, and a second flag is only a way for the two to
disagree.

---

## Buying previews

Stripe, and **hosted checkout** — the visitor leaves for Stripe's own page and
comes back. The consequence for this app is that there is nothing to configure
here at all: no card field, no Stripe.js, no publishable key, no
`NEXT_PUBLIC_STRIPE_*`. Every Stripe credential in the system is a secret on the
API.

It needs two things on the **API** side, not here:

| Server setting | What happens |
| --- | --- |
| `STRIPE_SECRET_KEY` | Checkout is open. `/v1/credits` answers `checkout: true`, packs are priced from their Stripe Price, and Buy works. |
| `STRIPE_WEBHOOK_SECRET` | The webhook is accepted. Without it every delivery is refused — an endpoint that grants credits with no signature check grants them to whoever finds it. |
| Neither | The packs are still listed with their credit counts, priced `null`, and `<Pricing>` says buying is not open on this deployment. This is what a fresh clone does. |

Plus one command, once per Stripe account, which creates the Prices and writes
the pointers into `credit_products.stripe_price_id`:

```bash
npm --prefix server run stripe:setup           # create the missing ones
npm --prefix server run stripe:setup -- --list # what is pointed where
```

**Where the price comes from.** `credit_products` has a credit count and no
amount; the API reads the Stripe Price each pack points at and sends
`price: { amount, currency }`. `lib/pricing.ts` — three indicative figures under
a disabled button — is deleted, and `lib/money.ts` replaced it with formatting
and no numbers. There is no price written down anywhere in this repository.

**Where the visitor comes back to.** The page they bought from. `<Pricing>` sends
the current path, the server resolves it against its own origin (a *path*, never
a url — `success_url` is followed from Stripe's domain seconds after card entry,
so an open redirect there is a real phishing vector), and `<CheckoutBanner>` in
the root layout says what happened. Most purchases start in `<TopUpDialog>` over
a haircut, which is why the receipt cannot live on `/account`.

**Why there is a confirm call as well as a webhook.** The webhook is the
authority. It is also occasionally two seconds slower than the redirect, and
showing somebody who has just paid their old balance is the worst moment to look
broken. `POST /v1/checkout/confirm` reads the session from Stripe — it does not
trust this app — and both paths key the purchase row on the PaymentIntent, so
one of them is always a no-op.

**Locally, with no Stripe account.** `npm run sandbox` serves a miniature Stripe
from its own process: Buy opens a stand-in checkout page, pressing Pay delivers a
correctly signed `checkout.session.completed` to the deployment's own webhook,
and the redirect comes back here. `POST /__sandbox/stripe/refund` does the other
half.

---

## Search

`docs/seo.md` is the design record. Three things to know before touching a page:

**Routes that render on the server.** `/hairstyles`, `/hairstyles/<slug>`, the text index at the
foot of `/styles`, the breadcrumbs and `<StyleAbout>` all read the catalogue through
`lib/catalogServer.ts` (a one-hour revalidation) rather than through `<CatalogProvider>`. That is
so the html holds the words and the links, which is what a first-pass crawler gets. The
interactive parts — the grid, the plate, the deck, the controls — are unchanged and still client
components.

**Every indexable page declares its own canonical, and none is declared on the layout.**
Metadata is inherited, so a canonical on the layout would claim `/` as the canonical of any page
that forgot to override it. The same class of trap applies to cards: `openGraph` is *replaced*
rather than merged, so use `og()` and `tw()` from `lib/seo.ts` instead of writing the objects out
— they carry `siteName`, `locale` and the default `og:image`, and a page that sets its own title
inline loses all three silently.

**Adding a hairstyle or a category still needs no code change here.** Titles, intros, questions
and lists are composed from catalog rows; `npm run catalog:publish` puts a cut in the sitemap, on
its collection page and in its own FAQ. If you find yourself typing a hairstyle name into
`lib/seo.ts`, `lib/collections.ts` or `components/seo/`, that is the rule being broken.

**In production, `NEXT_PUBLIC_SITE_URL` must be the real origin.** Every canonical, sitemap entry
and structured-data `@id` is built from it.

---

## Not built yet

- **Clerk**, as a *second provider* rather than as sign-in itself — a Google
  button is one tap where a code is a trip to an inbox. The server already
  verifies Clerk tokens (`CLERK_ISSUER` is the only setting it needs) and
  `AccountContext.signIn` is where a token from somewhere else would go.
- **Favourites on an account.** Currently `localStorage`. They are the one piece
  of state here that should follow a person; saved looks should not.
