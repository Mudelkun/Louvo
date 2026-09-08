# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 is built: a complete, navigable **frontend**. Two things behind it are now real.

**Preview generation.** With `EXPO_PUBLIC_API_URL` set it is a **backend job**: the app submits,
the photograph goes straight to a private bucket, a worker runs the model and the finished
preview is handed to the phone and deleted from the server. The generator key is not in the app
bundle and the work survives the app being closed — a push notification says when it is done.
With no API url but an `EXPO_PUBLIC_FAL_KEY`, the app still calls Fal.ai directly, which is the
prototype path and what a checkout with no server runs on; with neither it falls back to the old
simulation. `generationSource()` reports which of the three, and Settings prints it. The design,
the measurements and what "we do not store your photo" is precise about are in
`docs/preview-generation.md`.

**The catalog.** `server/` is a Node/Fastify API backed by Postgres on Railway, and the
mannequin renders are WebP objects in Cloudflare R2 behind its CDN. With
`EXPO_PUBLIC_API_URL` set, the app fetches its catalog and its imagery from there and caches
both. Without it the app behaves exactly as it did in phase 1 — `mockCatalog` and the bundled
renders — so a fresh checkout still runs with no backend, no bucket and no key. Settings
reports which of the three the running app actually got. The reasoning, the measurements and
the rejected options are in `docs/catalog-architecture.md`; the operational detail is in
`server/README.md`.

**Sharing.** A finished look is composed into a branded card on the device, handed to the
operating system's own share sheet, and carries a caption with a referral link the backend
minted. Following that link opens the app if it is installed and a landing page with the store
buttons if it is not, and the whole funnel — opened, channel picked, initiated, completed, link
opened, install attributed — is recorded. The picture never comes back to us: a share link names
a *hairstyle*, and what unfurls in somebody else's chat is the catalog's mannequin render of that
cut. `docs/sharing.md` has the design, what the operating systems actually permit, and exactly
which installs are honestly attributable.

**Credits.** Generation costs a credit. Every device gets **two free**, held against an
*install anchor* rather than the installation, so a reinstall does not hand out two more; after
that a user signs in and buys a pack through the App Store or Play. The balance is server-side and
transactional — held at submit, spent when the preview lands, refunded when it does not — and the
client is never trusted with it. Accounts exist only so purchased credits survive a phone;
signing in adopts the device rather than issuing a second token. `docs/credits.md` has the
design, the margins at both store commission rates, and the four places where what the brief asks
for and what a phone can actually do are not the same. `docs/sandbox.md` is how to test it: a
whole backend in memory (`npm run sandbox`) with control routes for the things a real store and a
real model will not do on request — forcing a generation to fail, granting a pack, simulating an
Android reinstall.

**The web.** `web/` is a Next.js app on the *same* backend — no server route was added or
changed for it. It is not a port of the phone app: `/` **is** the try-on — upload a photo, two
questions in a dialogue, then the catalogue already narrowed to them — rather than a landing
page in front of a five-step run, and the catalogue's white studio plates sit on near-black
under a display serif. It exists because a
web release is a deploy rather than a submission, because fifty-six named haircuts on indexable
pages is fifty-six entry points a binary does not have, and because Stripe takes ~3% where the
stores take 15-30%. **Sign-in is real, and it is a page rather than a dialogue** — Clerk's card
where there is a key for it and a mailed six-digit code where there is not — and
**Stripe is real and is a hosted checkout** — the visitor leaves for Stripe's own page, so this
build holds no publishable key and no card field. The catalogue is also **rendered for search**:
the pages that matter serve their words and their links in html rather than after hydration, and
the catalogue's own narrowings have real urls under `/hairstyles`. `docs/web.md` has the design,
`docs/seo.md` the search architecture, and `web/README.md` the operational detail.

Still simulated: favourites and saved looks (device-local).

Commands (run from the repo root):

```bash
npm install
npm start          # Expo dev server (syncs the generated render + example maps first)
npm run ios / android / web
npm run typecheck  # tsc --noEmit
npm run icons      # re-cut the launcher icon set from the artwork — free, no key
npm run mannequins -- --matrix   # the hairstyle x hair type matrix — free, no key
npm run mannequins -- --plan     # the length batch, one command per style — free, no key
npm run mannequins -- --check    # re-measure sheets on disk: bald panels, length range — free
npm run hair-types -- --dry-run  # the hair-type picker's examples — free, no key
npm run try-on -- --photo me.jpg --style buzz-cut --dry-run   # one preview — free with --dry-run

# The catalog backend. See server/README.md.
npm run api                   # the API in watch mode
npm run worker                # the preview generation worker in watch mode
npm run catalog:migrate       # apply server/migrations/*.sql
npm run catalog:check         # sync check + round trip + previews + credits + share funnel — free
npm run sandbox               # the whole backend, in memory: no Railway, no R2, no fal — free
npm run sandbox:drive scenario # the credit story end to end over HTTP, asserted — free
npm run catalog:publish:dry   # transcode + report; uploads nothing, writes nothing — free
npm run catalog:publish       # metadata into Postgres, imagery into R2

# Stripe. See docs/web.md and server/.env.example.
npm --prefix server run stripe:setup -- --list   # which pack points at which Price — free
npm --prefix server run stripe:setup             # create the missing Products and Prices

# The website. See web/README.md.
npm run web:dev               # Next dev server on :3000 (syncs web/lib/contract/ first)
npm run web:build             # production build; fails on a stale contract copy
npm run web:typecheck         # contract sync check + tsc --noEmit
npm run web:sync              # re-cut web/lib/contract/ from the app and the server
```

There is no linter configured. `npm run typecheck` is the check to run after changes to the
app; the server has its own (`npm --prefix server run typecheck`) plus its real tests,
`npm --prefix server run check` — the catalog round trip and the preview job lifecycle, both
described below; the web has `npm run web:typecheck`, which checks the contract copies are
current before it compiles. The root `tsconfig.json` excludes **both `server/` and `web/`**: the
three programs have different `lib`s (React Native, Node, the DOM) and typechecking one under
another's globals produces failures that are not bugs. `web/` matters for a second reason that
is easy to miss — the bare `node_modules` entry only excludes the root one, so without the
exclusion `web/node_modules/@types/react` joins the app's own copy in one program, which is how
a duplicate-identifier error appears in a file nobody touched.

The app follows the phone's light/dark setting by default and Settings can pin it either way;
the palettes and the rule that keeps them live are `src/theme/tokens.ts` and the theming
section below. Anything drawing a colour uses `makeStyles()` or `useColors()`, never a
module-scope palette read.

Reference material: `project.md` (product spec) and `App-reference.png` (the original flow
mockup — treated as inspiration, not a spec; the implemented design departs from it).

## What Luvo is

A React Native / Expo mobile app for virtually trying hairstyles. The user flow: upload a photo → pick gender → pick hair type → browse the catalog → generate an AI preview of themselves with that style → compare before/after, save, share.

The user picks a haircut. The length and fade-level controls the spec originally called for are gone from the app: the cut is the product.

**The first run is the same flow, walked in a different order.** `src/state/OnboardingContext.tsx`
holds it and `docs/onboarding.md` is the argument. There is deliberately no second copy of any
screen — an onboarding catalog would be a second place a hairstyle can be shown, and it would go
stale the first time either one was touched. Welcome leads *into* the flow rather than past it
(`begin()`), and exactly three things differ while the run is `active`:

- **Every screen shows where it is.** `step()` fills the progress bar `<Header>` already had.
  Outside the run it returns undefined and no screen shows a step, which is the honest state — the
  style page used to claim "Step 5 of 5" to somebody who had arrived from the Styles tab.
- **The photo is asked third, not first.** Gender and hair type decide *which catalog exists*, so
  they come before the face: a user who uploads a photograph and is only then asked two questions
  has done the work before being told why. The home tab keeps the opposite order on purpose — it is
  not a questionnaire, it is a screen whose one job is to take a photo. Both ask through the same
  `<PhotoChooser>`, so there is one wording and one promise.
- **Generation ends on the notification, explained.** `app/try/notify.tsx` sits *after* submit, so
  the preview is already being made while it is on screen and the offer is about a job with an id.
  It exists because the alternative is the bare system dialog — the most consequential yes/no this
  app ever puts up, with no room to say that the one notification it sends is the finished preview
  the user just asked for. `claimPushPrompt()` in `src/lib/push.ts` is what stops
  `GenerationContext` also raising it, and `previewPushAvailability()` is why the step never
  appears in a build that could not deliver a notification anyway.

**There is no paywall in it.** The credit gate is untouched and still sits where it always did —
`canGenerate` on the style screen — which for a first run means it never fires: every device has
two free generations, so the guided run is a complete preview from photograph to result without
a price ever being named. That is deliberate. Somebody who has not yet seen the product cannot
value it, and a pack shown before the first preview is a number with nothing attached to it.

Hair type *is* a property of a hairstyle — see the matrix section below — and is generated.
Colour is not a property of a hairstyle and is not generated. Every mannequin — drawing and AI render alike — is produced in one shade (`BASE_HAIR_COLOR` in `src/lib/constants.ts`) and recoloured on screen by `src/lib/colorGrade.ts`. **There is no colour picker in the UI right now**, but the app is no longer at the identity grade: the session starts at `DEFAULT_HAIR_COLOR_ID` (jet), so every mannequin is graded to black and the two shades the catalog is shot in stop showing as two hair colours in one grid. The grade, the masks and the session's `colorId` are all live and working. Putting the choice back is a `<SwatchRow>` bound to `setColor` — the default is a starting value, not a lock — and the reason it is worth keeping intact is below.

## Planned stack

- **Mobile:** React Native with Expo (iOS + Android)
- **Web:** Next.js (`web/`), on the same API. Sign-in is a **mailed six-digit code** (Resend),
  with **Clerk** as a second provider on the same route; payments are **Stripe Checkout** there
  rather than RevenueCat, hosted, with both keys on the server.
- **Backend:** Node.js API server, hosted on Railway (database also on Railway)
- **AI image generation:** Fal.ai — used both for the per-user hairstyle previews and for generating the catalog's mannequin images

## The web app

`web/` is a Next.js app against the **same backend the phone app uses**. No route was added to
the server and none was changed. `docs/web.md` is the design record; `web/README.md` is how to
run and deploy it. The decisions that govern any change to it are these.

**It is not a port, and `expo export --platform web` was the alternative that was rejected.**
The app already builds for web and that build would have been an afternoon. What it produces is
a phone in a browser window: one column, a tab bar, no URLs worth sharing, no server rendering,
every screen laid out against a 390px viewport. That fails at the three things the web is being
used *for* — being found, being linked to, and being changed on a Tuesday. `/styles/blunt-bob`
has to return real metadata with the cut's own render as its `og:image` before a shared link is
worth anything, and a client-only bundle cannot.

The second reason decided the visual design. **The app and the site are not addressed to the
same moment.** The app follows the phone's light/dark setting because it is a tool somebody
opens in a queue at a barber's — it is being *used*. The site is a shopfront: opened once,
deliberately, often on a large screen, with about four seconds to say what kind of thing Luvo
is. So it commits to one dark look, sets its display type in a serif, and puts the catalog's
white plates on near-black where they read as lit objects rather than as pictures on a page.
`plate` is `#FFFFFF` there for exactly the reason it is here, and `--color-on-plate` is taken
from the light palette for the same one.

**`/` is the try-on, and there is no landing page in front of it.** The site opened on a hero,
three explanatory sections, a privacy essay and a closing call to action, with the product one
click away behind a button — and separate `/how-it-works` and `/pricing` pages beside it. That
is the shape of software that has to argue before it can demonstrate. Luvo does not have to: the
whole proposition is a forty-second demonstration and a visitor is one photograph away from it,
so the upload box is the first thing on the page and the argument for the product is the
product. Both marketing pages are deleted and `next.config.ts` redirects them permanently,
because both were in the sitemap; the packs moved to `/account`, for the same reason the app has
no paywall in its first run — a price shown before a preview is a number with nothing attached
to it. The one explanation worth keeping, what happens to your photograph, is on the upload box
where the decision is made rather than on a page somebody has to go and find.

`web/components/home/TryOnFlow.tsx` is the flow and it has three *derived* states — a
photograph, two questions, then the catalog already narrowed to them. No wizard index and no
route per step. `/studio` is a redirect kept for links minted before the change;
`/studio/generating` and `/studio/result/[id]` are untouched. Six things about it are worth not
re-deriving:

- **The hero's evidence is real before-and-afters**, wiped by hand. *This will
  not look like me* is the objection that stops somebody, and nothing written
  answers it. It is a **set** rather than one pair, because one face answers that
  question for one person: a straight-haired before is evidence about straight
  hair, and somebody with a type 4 coil reads it as a promise made to a stranger.
  So the frame takes a list — both genders, the texture range — with thumbnails
  under it for switching, still one wipe at a time and still nothing moving on
  its own. The pairs are files in `web/public/hero/`, joined on whatever follows
  the prefix (`before-1`/`after-1`) and found by `app/page.tsx` reading the
  directory during the static render, so a checkout without them falls back to
  catalogue plates rather than to broken images and a file with no partner is
  dropped; `web/public/hero/README.md` is the brief for shooting them.
  `HeroCompare` is deliberately not `<BeforeAfter>` — that one is sized for the
  result page, where the frame has to take the shape the model returned — and it
  sets `touch-action: pan-y` on both the figure and its range input, without
  which a pointer target half a phone screen tall stops the front page scrolling.
  **It plays by itself, and that reverses the rule this file used to state.** The
  frame moved only when pushed — a drag, then the cursor — on the argument that a
  comparison the visitor performs is evidence and one performed *at* them is an
  advertisement. The argument was fine; its assumption was not. Both versions bet
  that somebody four seconds into a page works out that a picture is interactive
  and chooses to test it, and most do not — so the evidence went unseen by the
  people it was written for. The seam now sweeps on its own and the set rotates:
  six complete before-and-afters in twenty-six seconds, touching nothing — a
  total that grows by one cycle per face added, and is what to watch as the set
  grows rather than the cycle, which is paced for legibility. **That total is now
  past what the pacing was tuned for**: it was four faces in seventeen seconds
  until an Asian pair of each gender took the set to six, and twenty-six seconds
  is the figure the last re-tune was a reaction to. The set covers three
  ethnicities, both genders and the texture range, which is what it is *for*, so
  the cycle is the thing to shorten if it goes — preserving the shape, not the
  values. What
  keeps it from being a screensaver is the pacing — a 4.3s cycle of park (0.95s),
  reveal (1.3s), **hold on the finished cut (1.15s, the longest still moment,
  because the hold is the payoff)**, return (0.9s). Those were half again as long
  until a fourth face made the rotation twenty-five seconds, which nobody waits
  out; the **shape** is what a re-tune has to preserve, not the values, and
  `CROSSFADE` has to stay inside `PARK_BEFORE` or a face swap happens in view.
  **The pointer takes over the
  instant it is over the picture and the loop stops dead** — autoplay that
  ignores you is the actual insult — and `phaseNearest` re-enters the timeline
  where the seam was left so leaving hands it back without a jump. A finger drags
  and does the same on release, which is why `pointerType` is consulted. Tapping
  a face **pins** the set, since a choice outranks a demonstration (the rule
  `<HairTypeChoice>` follows), though the sweep continues because the sweep is
  the evidence. `prefers-reduced-motion` switches off the sweep and the rotation
  both, and an `IntersectionObserver` stops the loop when the hero is scrolled
  away rather than animating a picture nobody is looking at. The seam is written
  through refs in an animation frame, never state: the loop would otherwise be a
  render of the whole hero sixty times a second to move one edge.
- **The catalogue strip under it drifts, and it carries the whole shelf.** It was twelve
  stationary plates, six per gender, picked by popularity — and twelve is a sample rather than a
  catalogue: it answers *is my haircut in there* for twelve people and reads as *no* to everybody
  else. Each shelf is now everything the catalogue has shot for that gender, moving, with **women
  left to right and men right to left** — two rails going the same way read as one escalator and
  the eye picks a lane, where contra-motion reads as two shelves. Speed is held constant across
  shelves of different lengths (`SECONDS_PER_PLATE` × the plate count), it **stops under the
  pointer** because every plate is a link, and reduced motion gets a still scrollable row rather
  than a paused one — a paused marquee is a rail nobody can reach the end of. Each plate cycles
  through the textures its cut was shot in on the grid's own `useVariantCycle` beat, captioned
  with the types that render stands for, and that cycle is deliberately **not** narrowed by a
  declared hair type: this is the hero's set-of-faces argument applied to the catalogue, and the
  caption is what keeps it honest. `<StyleChooser>` and `/styles` still narrow strictly. The loop
  is two copies of the shelf travelling half the track's own width — which is why the plates carry
  their gap as a trailing margin rather than the track carrying `gap` — and the second copy is
  `aria-hidden` and out of the tab order. The two shelves still never draw the same *photograph*
  twice; the dedupe is on the render's url, so a unisex cut with one shot is illustrated on the
  other shelf until its own render is published.
- **The photograph comes first here and second in the app**, and that is one argument reaching
  two answers. The app asks gender and hair type before the face because its first run is
  somebody's introduction to the whole product. A browser is entered sideways and the upload box
  is what the visitor came for, so the picture opens and the questions follow it immediately — at
  the point they start to matter, which is the point a grid has to be narrowed to be honest.
- **The two questions are raised on every upload, not once per visitor.** Both are about the
  person in the *picture* rather than the person at the keyboard, so a stored answer is only good
  for the photograph it was given about: somebody trying a cut on a friend, or returning for a
  different face, would otherwise be silently browsing the wrong catalog with the controls a chip
  row away — precisely where nobody looks while nothing appears to be wrong. `answeredFor` in
  `TryOnFlow` is the photograph the answers belong to.
- **Nothing in the dialogue arrives pre-selected**, which follows from that rather than
  contradicting it: if an answer belongs to a photograph, last visit's answer is a fact about a
  different picture, and showing it lit is the screen guessing about a face it has not seen. A lit
  tile is also the easiest thing in the world to tap past without reading, which is how somebody
  ends up browsing the wrong catalog while believing they chose it. The session still remembers —
  the chips after the dialogue carry the answer — but the dialogue asks rather than proposes.
- **The two questions are a dialogue, not two control rows.** `SetupDialog` — once answered they
  are furniture, and they stay as two chips that reopen it.
- **Neither question is illustrated with a catalog render, and both were.** *Gender* was two
  mannequin plates, the most popular men's cut beside the most popular women's — but it asks
  *whose catalog*, which is a category, and two haircuts side by side invites comparing them **as
  haircuts**: the visitor reads "do I want this crop or this lob" and answers a question nobody
  asked. It is the two gender signs now — Mars and Venus, blue and pink, the one symbol pair that
  is read rather than interpreted — which also lets the first question render without waiting on a
  fetch. The blue is `--color-azure`, added for this control and nothing else: two tiles in one
  violet would read as one thing offered twice, which is the two-haircuts mistake made with
  colour.
  *Hair type* was wrong rather than off: the tile drew the most popular cut offered for each type
  in that type's texture, and the most popular cut is usually the *same* cut for all four — so the
  row was one haircut four times with a curl difference too small to see. It reads
  `catalog.hairTypeExamples[gender][type]` instead, the set
  `scripts/generate-hair-type-examples.mjs` makes, where the subject *is* the texture. All four
  for a gender or none, enforced server-side. **No set has been generated yet**, so the tiles fall
  back to the standard straight/wavy/curly/coily diagram until `npm run hair-types` has been run
  for each gender and published — at which point the photographs take over with no code change.
- **There is no dead end in it.** Gender has no skip, because it decides which renders exist.
  Hair type does, because *all types* is a real answer rather than a refusal to give one — so it
  is one of the choices rather than an escape hatch.
- **The chooser narrows the catalogue; it does not lock it.** `StyleChooser` offered categories
  and a search and nothing else, on the argument that gender and texture were answered two
  questions ago and re-offering them asks the same thing twice. Half of that was right and half
  was not: asking twice is not the failure, *answering on somebody's behalf and then hiding the
  switch* is — a visitor who wanted the women's shelf, the coily one, or everything regardless
  had to go back through a dialogue to find the control. So it carries the same rail `/styles`
  does, **pre-set to the answers already given** rather than empty, which is the difference
  between a filter and a question and why the dialogue is still worth having in front of it.
  The rail itself is `<CatalogFilters>`, shared by both surfaces so they cannot drift into
  offering different controls over one catalogue; what each page owns is the *frame* around it
  — sticky and bled to the gutters on `/styles`, plain in the flow. Every control writes
  straight to the session, so the style page a card opens moves with them. The summary row above
  the grid no longer restates the two answers as chips: two places to change one thing.
- **Every dimension states its answer; none of them lists its options.** The rail was fourteen
  chips, a segmented control, a field and a select. On a laptop that was one busy line; on a
  phone it stacked into four bands — two of them rows of identically drawn chips asking two
  different questions — and took a third of the screen before a single haircut. The mistake was
  treating *every option is visible* as the goal: what somebody needs to see is **which catalogue
  they are looking at**, which is four short words. So each dimension is one pill saying its own
  answer (`Everyone`, `All textures`, `All shapes`, `Most wanted`), tinted when it is narrowing,
  and opening its options only when asked. They are native `<select>`s — the sort control already
  was one — so the picker is the platform's, which on a phone is the wheel or the sheet the user
  already knows, and there is no popover, focus trap or keyboard handling of ours to get wrong.
  What is lost is one-tap category switching on a laptop, where the chips did fit; that is the
  trade, and one control that is the same object at every width is worth it.
- **A card is a link, and the preview is generated on the style page.** The grid selected a cut
  and generated from a bar at first, and that was wrong because **a haircut has a length**: a
  minority of cuts are offered at two or three, that control lives on the style page with the
  four angles and the texture chooser, and generating off a card silently sent the anchor length
  every time — a cut somebody could have had short going out at its usual length with nothing on
  screen having mentioned it. A card also shows one three-quarter render, and *what does the back
  look like* is a real question about a haircut. So `<TryOnAction>` in `StyleDetail` is the
  button that spends a credit, which is also where somebody arriving from a search result or a
  shared link finds it. `app/styles/[id]/page.tsx` reads `?length=` from its own search params —
  a server component is handed them, so there is no hook, no Suspense boundary and no second
  render.
- **A missing photograph is taken on that page, not sent back to the flow for.** It degraded to
  a link into the home flow, which asked for the picture, raised the two questions and then
  carried the cut and the length back so the round trip ended on the style page rather than on a
  grid. It worked and it was still wrong: somebody standing on a haircut has already done the
  part the dialogue exists to help with — a dialogue that narrows a catalogue is worth having in
  front of a catalogue, and in front of one cut it is a toll on the way to the thing they came
  for. So the button opens the file picker in place (`usePhotoIntake`, shared with the hero's
  drop box so there is one decode, one size cap and one refusal wording — two surfaces that
  describe the upload differently are two different promises about somebody's face), the page
  does not move, and the length, the texture and the angle are exactly as they were left.
  **Gender is the one answer that is still asked**, because it decides which render exists — as
  two buttons in the action itself rather than as a navigation, and hair type is not asked at
  all: *all textures* is a real answer and its control is already on the page. The prose under
  the action that also sets gender is drawn only while there is no photograph, so there are
  never two live controls for one answer six inches apart. `?style=` still works — `TryOnFlow`
  reads it, and links minted before this exist — but nothing mints it any more.
- **An empty balance does not change that button, it changes what pressing it does.** It became
  *Top up to keep going* pointing at `/account`, which is honest and is still the wrong control:
  somebody standing on a cut with their photograph loaded has one intention, and answering it
  with a different verb and a navigation loses the cut, the length and the texture they had set
  up. The label is the same at every balance and `<TopUpDialog>` opens over the page instead —
  the same `<Pricing />` rows, so the packs stay a database row rather than a release, with the
  cut still behind it and nothing lost by closing it. Nothing is queued behind a purchase: the
  generation happens when Generate is pressed again with a credit to spend, which is one tap and
  is the truth. The line under the button is where "none left" is said, so the dialogue is not a
  surprise.
- **An empty balance is two states, though, and the packs are the wrong answer to one of them.**
  Signed in and out of previews gets `<TopUpDialog>`. **Never signed in gets `<SignInWall>`** —
  *Sign in to preview more hairstyles* — and that is not a softer paywall, it is the only one of
  the two that is not a dead end: credits live on an account, so `<Pricing>` sends a signed-out
  Buy to `/sign-in` anyway, and showing the packs first puts three prices in front of somebody
  whose every next step is the page behind them. A first sign-in carries `grantSignupBonus`, so
  the visitor who does what the wall asks can generate again without paying — and **the wall
  never says so**. *Sign in and get a free preview* turns an account into a transaction, which is
  the shape of a trick even when the offer is real, and it is a promise about
  `SIGNUP_BONUS_CREDITS`, a server-side constant the browser cannot read and must not guess at.
  The credit is a consequence of signing in, not the reason given for it. Both dialogues are
  `<Dialog>`: one scroll lock, one Escape handler, one reachable backdrop, one answer to what a
  card does when it is taller than the phone it is on. The app split the same way first, by a
  different road — `app/credits.tsx` offers *Sign in or create an account* in place of the packs,
  because a purchase there needs an account too.

**The site is rendered for search now, and the defect it fixes was not a missing tag.**
`docs/seo.md` is the design record. Every page that mattered was a client component reading a
context, so the html a first-pass crawler received was a skeleton — no heading, no prose, and
**no link from anywhere to any hairstyle**. Google renders JavaScript on a second pass, from a
queue it prioritises by how much it already trusts a domain, which is the wrong deal for a new
one and is not the deal at all for Bing, the social scrapers or the answer engines. Nothing
moved out of the browser: `<StyleDetail>` still owns the plate, the deck and the button that
spends a credit, and `<CatalogBrowser>` still filters against memory. What changed is that the
route beside them fetches the same catalogue on the server (`web/lib/catalogServer.ts`, an hour's
revalidation) and renders the words. Six things decide any change to it:

- **Facets get pages; query strings get canonicals.** `/styles` narrows through React state, so
  there is no url to rank — and where the answers do reach the url (`?gender=`, `?hairType=`,
  `?length=`) they make a dozen near-identical documents compete for one query. So a fixed small
  set of narrowings has real urls under **`/hairstyles/<slug>`** — a gender, a texture, a
  category, or a gender with one of those — each with its own heading, its own copy composed from
  the catalogue's own `tagline` and `description`, its own canonical and its own `ItemList`;
  `web/lib/collections.ts` is the grammar and 34 exist today. Everything else canonicalises to
  the bare path. `Disallow` on the parameters was rejected: it stops a *crawl* rather than a
  duplicate, and a blocked url something links to is still indexable with no content, no way for
  us to say what it copies, and its link equity thrown away. Canonicals consolidate; robots rules
  discard. `MIN_STYLES` is the floor — a combination that cannot fill a page is not enumerated,
  is not in the sitemap and 404s, because thirty auto-generated pages holding three items each
  look exactly like what they are.
- **The words go below the product, never in front of it.** The front page's shape is unchanged
  and this did not reopen it — the upload box is still first, there is still no landing page, and
  the two marketing pages are still deleted and redirected. `<HomeSeo>` sits *under* the flow,
  the hero and the catalogue strip. The same argument settled the style page: `<StyleDetail>`
  deliberately has no prose in it and that decision stands, because the argument was about
  **position** — a paragraph between the picture and the controls that change it put the length
  slider off the bottom of a phone. `<StyleAbout>` restores the description, the "Suits" line and
  a linked specification *below the suggestion shelf*. Nothing above the fold moved.
- **Every factual sentence in the FAQs describes this repository**, the rule `src/lib/legal.ts`
  is written under, and the structured data quotes those answers verbatim — so a drift is a drift
  between what we tell a person and what we tell a crawler. The photograph answer is the scrub in
  `check-previews.mjs`, the free-previews answer is `install_anchors`, the texture answer is the
  variant matrix. A change that makes one false edits the FAQ in the same commit. The same rule
  forbids an `offers` node or an `aggregateRating` anywhere: the price is Stripe's and this build
  never sees it, and there are no ratings. A hairstyle is a `CreativeWork` and not a `Product` —
  no SKU, no availability, and what is sold is a preview.
- **No hairstyle, category or hair type name is written down in any of it.** `web/lib/seo.ts`,
  `web/lib/collections.ts` and `web/components/seo/` compose every title, intro, question and
  list from catalog rows, so publishing a cut puts it in the sitemap, on a collection page, in an
  `ItemList` and in its own FAQ with no release. The one exception is the six shelf links in
  `<HomeSeo>` and the four in the footer, which are a *navigation* decision and are built from
  genders and hair types — fixed dimensions of the data model, not rows anybody can publish.
- **A canonical never goes on the layout.** Metadata is inherited, so one there would quietly
  claim `/` as the canonical of every page that had not overridden it. For the same class of
  reason `openGraph` is **replaced rather than merged** — a page declaring it to set a title
  loses `siteName`, `locale` and the file-based image with it, silently, and the link posted into
  a chat is a bare grey row. `og()` and `tw()` in `web/lib/seo.ts` exist so that cannot happen by
  omission, and `app/opengraph-image.tsx` is the generated card behind them.
- **The renders are in the sitemap and the AI crawlers are let in.** 103 urls and 64 image
  entries: "what does a taper fade look like from the back" is answered by a picture, and an
  image sitemap is the one thing that puts a render url in front of a crawler without waiting on
  a render pass. `GPTBot` and the rest are admitted deliberately — a growing share of "which app
  lets me try a haircut on my photo" is answered inside an assistant, everything they can reach
  is mannequin renders and prose, and nothing behind the try-on is reachable at all.

**`NEXT_PUBLIC_SITE_URL` is the one setting that can undo all of it.** Every canonical, every
sitemap entry and every `@id` in the graph is built from it, so a deployment left on the Vercel
default advertises canonicals on a domain nobody links to.

**Four programs now read the catalog, and the boundary rule is unchanged.** A *predicate* may
be mirrored by hand and kept honest by running both copies; a *document* may not.
`web/scripts/sync-contract.mjs` is that rule applied — it copies `server/src/types.ts`,
`src/lib/legal.ts` and `src/lib/hairShape.ts` into `web/lib/contract/`, re-pointing only their
import headers, and `--check` runs in `web:typecheck` and `prebuild` so a stale copy fails
rather than ships. **Edit the source, never the output.** `web/lib/hairTypes.ts` is the
deliberate exception: the hairstyle × hair type predicates, mirrored by hand, because they must
compile against the web's own types and because two implementations of "is this cut offered for
type 4" genuinely can be compared by running them.

**The device secret is weaker in a browser, and the code says so rather than papering over it.**
`Authorization: Device <secret>` works unchanged — 32 random bytes minted on first use. The
difference is where they live: on a phone that is the platform keystore, which on iOS outlives
a reinstall; in a browser it is `localStorage`, which a private window does not have. So the two
free previews are easier to take twice there. That is a deliberate trade, because the
alternative is fingerprinting — which this codebase refuses, which both stores forbid, and which
denies free generations to people who never had any. No `X-Install-Anchor` is sent: it is
Android's answer to a cleared keystore and there is no browser equivalent that is not
fingerprinting. The real fix, when there is money on the line, is an account *before* the free
allowance rather than after, which is a Clerk change and not a client one.

**CSS `mask-image` is subject to CORS and SVG `<mask>` is not, and that decides how the colour
grade is drawn.** The catalog's CDN serves renders public and immutable with no
`Access-Control-Allow-Origin`, so a masked `<img>` overlay — the obvious implementation, and the
one the app uses — has its mask request rejected, the element is treated as fully masked out,
and the grade silently disappears. Nothing looks broken: what you get is a grid with **two hair
colours in it**, espresso beside black, which is exactly the defect the grade exists to remove.
So `web/components/Plate.tsx` draws the overlay as an inline `<svg>` whose `<mask>` holds an
`<image>`: SVG masks paint cross-origin content without CORS because nothing is read back.
**Do not "align" it with `<Mannequin>`** — `react-native-svg` has no such rule, which is why the
app can use a plain masked layer and why this could never have appeared there. Adding CORS to
the bucket would also work and was rejected: it makes correct rendering depend on a bucket
setting nobody would think to check.

**Two deployment facts, and both fail silently.** The photo upload is the one request that
leaves the site's origin, so the preview bucket needs that origin in its CORS policy — a bucket
with no policy answers the preflight `403 CORS not configured`, which a browser reports to
JavaScript as a bare `TypeError` with no status, after which the job sits in `awaiting_upload`
looking exactly like a slow queue (`node server/scripts/preview-cors.mjs https://origin`). And
`SHARE_BASE_URL` should point at the site rather than at the API host, or minted links open the
app's install landing page instead of a hairstyle.

**Sign-in is a page, not a dialogue, and it is `/sign-in` and `/sign-up`.**
`web/components/auth/AuthScreen.tsx` builds both: Clerk's own card where there is a publishable
key, and `<EmailCodeForm>` — an address and a six-digit code against our own API — where there
is not, which is what keeps a fresh checkout and the sandbox able to sign in with no keys at
all. It was a modal, and the argument for that was `<TopUpDialog>`'s and was real: answering a
two-field errand with a navigation loses the cut, the length and the texture. What it cost was
the rest — the most consequential form on the site in a box a stray click dismissed, with no url
to come back to and nothing to link to from an email, reading as something that had interrupted
you rather than as somewhere you had gone.

**`?next=` is what the modal was actually protecting.** Every door into sign-in carries the path
it was pressed on (`useReturnPath` in `components/AuthButtons.tsx`) and the visitor is put back
on it — Clerk through `fallbackRedirectUrl`, the mailed code through its own confirmation, and
`<Pricing>` additionally through `?buy=<pack>`, so a purchase interrupted by sign-in resumes on
the way back. `safeNext` refuses anything not starting with a single `/`, the same rule
`checkout.ts` applies to Stripe's return. **The photograph survives it too**, and that took a
fix: an object url is a handle the *document* holds, so a provider that comes back as a fresh
page load — and Stripe, which is a different origin entirely — used to take somebody's picture
away as the price of the round trip we sent them on. `web/lib/pendingPhoto.ts` mirrors the bytes
into IndexedDB while they are the photograph on screen and `SessionContext` adopts them back on
mount, filling a hole only — a picture chosen while the read is in flight wins. It is one record
that mirrors the session, deleted when the photograph is cleared and expiring after an hour, and
it is a weaker version of what a *saved look* already does with the same photograph in the same
database for ever. The alternative — uploading it early so it survives — was refused: the
photograph reaches a bucket when there is a job to consume it and is deleted when that job
settles.

**The page is one centred column.** A second one beside the form — what Luvo is, in three
points — was written and then removed: the copy that belongs there is still being decided, and
whatever lands there goes in `AuthScreen`'s own column rather than inside Clerk's card. Clerk
draws that card and **is not restyled**: it carries its own title and its own back link
between steps, and hiding its `header` to remove the duplicated heading would take that back
link with it. `[[...sign-in]]` is an optional catch-all because the card is not one screen —
verification, factor two and the SSO tail are child paths. `/account/profile` mounts
`<UserProfile />` the same way, for the same reason: one kind of surface for one kind of errand.

There is no separate sign-up without Clerk, because there is no separate route — `upsertAccount`
creates the account when the identity is new and finds it when it is not, and a first sign-in
carries `grantSignupBonus`, which is why the confirmation names the balance rather than
navigating away.

**Signing out is in the header**, under `<AccountMenu>` — the account mark, which is the Clerk
profile photograph where the identity came with one (`hasImage`, never `imageUrl`, which is
never empty) and the initial where it did not. It was only on `/account`, which made leaving the
one errand on the site somebody had to navigate to do.

**Signing in adopts the browser's device rather than issuing a second token**, which is why
neither the provider nor the dialog stores anything: the server sets `devices.user_id` on the
device secret it already trusts — the column `003_previews.sql` created on day one — so
`Authorization: Device <secret>` remains the only credential a browser holds, before and after.
`signIn` and `signOut` set the state from the **server's own reply** rather than adjusting the
previous one, which is the same rule that forbids an optimistic balance anywhere else here.

**A deployment with no `RESEND_API_KEY` cannot mail a code**, and it says so — the route answers
`email_unconfigured` and the dialog reports it as this deployment's fault rather than the
visitor's. `EMAIL_DEV_ECHO=true` hands the code back in the response instead, prefilled and
labelled as a development setting, and the server refuses to echo whenever a mail provider is
configured. That is what makes the sandbox a complete sign-in with no key at all.

**Stripe is built, it is hosted Checkout, and there is no publishable key anywhere.** The
visitor leaves for Stripe's own page and comes back, so no card field, no Stripe.js and no
`NEXT_PUBLIC_STRIPE_*` exist in this build — both credentials are secrets on the API, and our PCI
surface is SAQ A. `server/src/stripe.ts` is four calls and a form encoder rather than the SDK, for
the reason `mail.ts` is plain `fetch` and `storage.ts` signs SigV4 by hand. `docs/web.md` has the
design; six things decide any change to it:

- **The price is a Stripe Price and there is no copy of it here.** `credit_products` gained
  `stripe_price_id`, which is a *pointer*: the API reads the Price when it lists the packs and
  sends the amount as a label, cached a minute, never stored. `web/lib/pricing.ts` — the
  indicative figures under a disabled button — **is deleted**, and `web/lib/money.ts` is
  formatting with no numbers in it. `server/scripts/stripe-setup.mjs` creates the Prices and
  writes the pointers, and it is a script rather than a migration because test and live are two
  Stripe accounts with two sets of Price ids behind one schema.
- **The webhook is the authority and the confirmation is the timing.** Stripe redirects the payer
  back a second or two before the delivery lands, and showing somebody who has just paid their old
  balance is the worst possible moment to look broken. `POST /v1/checkout/confirm` reads the
  session **from Stripe** rather than trusting the browser, and both paths write a purchase row
  keyed on the PaymentIntent — so whichever arrives second is caught by `purchases_transaction_idx`
  and grants nothing. That index is load-bearing rather than defensive. The alternative was
  polling `/v1/credits` the way the phone waits on RevenueCat, which cannot tell "the webhook has
  not arrived" from "the payment failed".
- **The signature is the whole security model, and it needs the raw bytes.** `JSON.parse` then
  `JSON.stringify` is not the same string, so `stripeWebhookRoutes` is a separate plugin with its
  own buffer content-type parser — encapsulation is what keeps that off `/v1/account/sign-in`.
  Constant-time compare, any matching `v1` (a rotation signs with both), and a five-minute
  timestamp window so a captured delivery cannot be replayed. Idempotency is deliberately *not*
  in that check: a legitimately retried delivery is signed correctly and must be accepted, then
  found to be a duplicate by the indexes.
- **The credit count is looked up, never read off the payload.** `credit_products` is the row this
  service owns; the metadata on a session is for the Stripe dashboard and for reconciliation. A
  session that claims a thousand credits grants what the pack is worth.
- **The browser sends a return *path*, never a url.** `success_url` is a link the payer follows
  from Stripe's own domain moments after typing card details, which is as trustworthy as a
  phishing target ever gets, so the origin is the server's (`CHECKOUT_RETURN_URL`) and
  `//evil.example` is refused rather than sanitised. The path is where the visitor was standing,
  so somebody who topped up on a haircut comes back to that haircut with its length and texture
  intact — which is why `<CheckoutBanner>` is mounted in the root layout rather than on
  `/account`: most purchases start in `<TopUpDialog>` over a cut, so the receipt has to be able to
  appear anywhere.
- **Whether checkout is open is the server's answer.** `/v1/credits` reports `checkout:
  true|false` and `hasStripe` is gone from `lib/config.ts` — it read a publishable key in *this*
  build to decide something about a key on the *API*, which a build with one and not the other
  would have shown as a button that 503s. Same rule as `catalogSource()`: reported, never assumed.
- **The account's email is prefilled and Stripe holds it read-only.** Read from `users` inside
  the route rather than taken from the request, for the reason `client_reference_id` is, so the
  receipt reaches the inbox the credits are held against rather than one typed once at a till. An
  account with no address — Apple with the email hidden, a Clerk token with no claim — sends no
  field and Stripe asks.
- **`/account` lists what was paid, under the packs, and it is not the credit ledger.** A total
  spent, the previews it bought, and one row per completed checkout —
  `<PurchaseHistory>` over `GET /v1/purchases`. The ledger was cut from this page on purpose and
  stays cut: one row per *movement of a credit* is a support tool that reads as a bank statement,
  where one row per *transaction* is what somebody arrives asking for. The total is the server's
  and `spent` is **a list, per currency**, because two currencies cannot be added without a rate
  and a rate is a second price. A refunded row is shown and not counted — hiding a reversal
  leaves a history nobody can reconcile, counting it overstates what we were paid — and
  `check-stripe.mjs` asserts both halves.
- **The invoice is Stripe's document, fetched at the press and never stored.** `invoice_creation`
  puts a numbered PDF behind each payment, because an invoice needs a sequence, a tax
  registration and an address that this service does not hold and should not start holding.
  `GET /v1/purchases/:id/invoice` answers with a **url**: no bytes through this process, nothing
  cached, since a stored `invoice_pdf` is a link that outlives what it pointed at. It is not
  retroactive — a payment taken before it was on falls back to the charge's hosted receipt and
  says `kind: 'receipt'`, and the row re-labels its own button rather than calling a receipt an
  invoice. A purchase id is not a bearer token (`where id = $1 and user_id = $2`), and an
  app-store row carries `documented: false` so no button is drawn over a receipt that lives in
  somebody's Apple account. **There is no card on file to manage** — a pack is one payment with
  `setup_future_usage` unset — so the page says that instead of offering to manage nothing.

`server/scripts/check-stripe.mjs` runs in `npm run check` with no key and no network, and
`npm run sandbox` serves a **miniature Stripe from its own process** — Buy opens a stand-in
checkout, Pay delivers a correctly signed `checkout.session.completed` to the deployment's own
webhook, and `POST /__sandbox/stripe/refund` does the other half. `STRIPE_API_BASE` is what makes
that possible and is the only test hook in the service; never set it on a real deployment.

**The result page is two columns, and what to try next is one of them.** The preview on the
left, the cut's description and four suggestions on the right — beside the picture from `lg`
rather than a scroll below it, because somebody looking at a haircut on their own face is the
most likely they will ever be to want a second one and a suggestion under the fold is one most
people never see. A phone has no "beside", so the same pieces interleave instead: the cut's
name above the picture, the actions under it, and the suggestions directly beneath those. Both
wrappers are `contents` below `lg` and every piece carries an `order`, so there is one DOM and
two arrangements rather than a second copy of anything. The four
are seeded from the cut that was just generated by the same `relatedTo` the style page uses —
narrowed by the gender and hair type recorded on **the look** rather than the ones in the
session, for the reason `TryOnFlow` re-asks both on every upload: those answers are about the
photograph, and a session that has moved on to a different face would narrow the row to the
wrong catalog. From `sm` they still sit below "About this cut", because that heading names the
cut in the picture and other haircuts above it would leave it pointing at whichever one the
eye landed on last — but on a phone that ordering put them under two screens of scroll, which is
where suggestions go unread, so below `sm` they come straight after the buttons.

**The row is `<SuggestionShelf>`, the style page's *In the same direction* is the same component,
and it drifts at every width** — left to right, on the front page's own marquee, the same
keyframes run backwards. It was a static four-card grid from `sm` and a drifting row only below
it, on the argument that four cards a laptop can already see whole have nothing to gain from
moving. That was true about the *cards* and wrong about the *catalogue*: four is a sample, and a
row of exactly four reads as the four this page has rather than as the shelf it is standing on —
the same mistake the front page's twelve stationary plates made before they became the whole
catalogue, moving. So it asks for `SUGGESTION_COUNT` (ten) and always has one more arriving. It
stops under the pointer, since every card is a link, and reduced motion gets a still scrollable
row rather than a paused one. One heading, one "All cuts" link, one rail: two places offering a
next haircut in two different shapes read as two features rather than as the catalogue's own
"and then?", and a marquee written twice is two chances for the phone and the laptop to
disagree. Each page owns only the frame: the result page its column order and the sentence
about the photograph, the style page its rule and the space under the plate. There is no such
sentence on the style page, because the button above it has already said what a preview costs.
The preview is capped at `42svh` on a phone to make the room — still the largest thing on the
page by a wide margin, just no longer the only thing on it.

**The preview is shown whole; the comparison is a button.** The page opened on the wipe at
half — the first sight of what a credit had just bought was half of it, with an unchanged
photograph filling the rest and a handle down the middle of somebody's face. The comparison is
the *second* question; the first is "what do I look like", and only the whole picture answers
it. `<BeforeAfter>` is used in both states, handed `before={null}` when it is not comparing,
which is its own no-slider branch — swapping between two frames would move the picture by
whatever the two disagreed about.

**The primary action on that page is the next haircut, and for a signed-out browser it is an
account.** The row under the preview was Download, Share, Delete — three things to do with the
picture that already exists and nothing about the next one, which is the wrong answer to the
moment the whole two-column layout is built around. So *Keep trying hairstyles* sits above that
row while `credits.signedIn` is false, and Download drops to `secondary` beside Share for as long
as it is drawn; nothing is removed. It offers **more hairstyles, never one more generation** —
the `<SignInWall>` rule, for the same reason: naming `grantSignupBonus` turns an account into a
transaction and is a promise about a server-side constant the browser cannot read. It is not
gated on an empty balance, because it is an offer rather than a refusal; the refusal is
`<SignInWall>` on the button that would have spent the credit. Drawn only once `ready` is true,
since `ready: false` is not "signed out".

**Every link out of a preview carries the answers it was generated with**, and
`useAdoptedAnswers` in `SessionContext` is what reads them back in — once, and only after the
session has hydrated, since the provider reads `localStorage` in an effect and a child's effect
runs before its parent's. `?gender=…&hairType=…` goes on the cut, on the four suggestions and
on "All cuts", so a catalogue reached from a finished preview opens already narrowed to it; the
style page and `CatalogBrowser` both adopt it, which is also what finally makes the query
`CatalogBrowser` has always minted into its card links do something. The **length is not** in
that set: gender and texture are facts about the person in the photograph and travel to any
cut, where a length is a fact about *one* haircut and most of the catalog is offered at only
its anchor — so it is added to the link to the generated cut alone. The result page adopts the
look's own two answers the same way, because without it the cards are drawn from the look and
the page any of them opens is drawn from the session: one texture on the card, another on the
page.

**On a phone the style page's plate is a deck you swipe, and the two adjustments sit under it.**
Two changes against one problem. The four angles were thumbnails below the picture — a fine
control with a mouse, a poor one with a thumb, and one somebody has to work out is there at all —
so the picture itself is now a scroll-snapped deck of the four, which is the gesture every
photograph on the device already answers to. Snapping rather than a hand-written pan, so
momentum, rubber-banding and the platform's pointer behaviour come free.

**The tiles stayed, and that was a correction.** The deck first carried four dots, on the
reasoning that something you swipe does not need a second way to page it. Both halves of that
were wrong: a dot says a panel exists and nothing about what is on it, so *what does the back
look like* still cost three swipes and a guess — and a swipe is invisible until somebody tries
it, so a visitor who never thinks to try had no way in at all. `<AngleTiles>` is now one
component for both surfaces, differing only in `onPick`: a tap scrolls the deck on a phone and
sets the angle on a laptop. Tapping scrolls rather than setting, so the angle follows the
scroller in both directions and a tap gets the same snap a swipe does. The panels are
anchored on **one** variant list resolved at the hero angle, never one per angle: a partially
shot cut would otherwise put its curly front beside its coily back, which is the failure
`mannequinMask` avoids a level down. The deck does not depend on the selected angle either, so a
swipe moves the scroller and rebuilds nothing.

The second change is what the deck's capped height buys. Hair type and length used to sit below
the description, the "Suits" line and the tag row — about 200 points of prose between a control
and the picture it changes, so a tap on *Coily* was answered off screen. That prose was reordered
below the controls on a phone first, and is now **off the style page entirely**: four studio
angles of the cut in the visitor's own texture say more about what it is than three sentences do,
and the decision being made on that page is whether to spend a credit putting it on your own
face, which no adjective moves. Nothing is deleted with it — a catalogue card still captions
itself with the cut's first tag, `searchStyles` still matches on the description, and the result
page keeps "About this cut", where the picture is of the *visitor* and the prose is the only
thing naming what was done. The placeholder lost its three text lines in the same change, since a
skeleton standing in for prose that never arrives is the layout lying about itself. Picture and
controls now land on one screen, which is the same argument the app's `<ControlCard>` makes about
its own fold, reached on a different device.

**On a laptop the picture column *is* the plate, and the plate is capped by the window's height**
— the same argument as the phone's fold, reached on a different device. A square plate across a
730px column is a 730px picture, and under it four angle tiles, a rule and a heading, so *In the
same direction* began below the fold on every laptop, which is exactly where a suggestion goes
unread. Nothing was bought by the extra 300px: the subject is one head on a white ground and at
`clamp(280px,38svh,440px)` it is still the largest thing on the page by a wide margin.

Capping the *picture* was the first attempt and it is the instructive failure: the column was
still `1fr`, so a 730px track held a 340px plate and the page gained a 370px hole down its middle.
The cap belongs on the **grid track** (`--plate`), which leaves the column no width to sit the
picture in the middle of and hands the tiles beneath the plate's width for free. `--measure`
(`--plate` + the gap + the 430px detail column) is then the width of the whole page — the back
link, both columns, the rule and the shelf — centred in the window, so one left edge runs the
length of the page and there is nothing left over to distribute. Both are set once, as custom
properties on `StyleDetail`'s own wrapper: `StyleDetailSkeleton` is a descendant and inherits
them, so the placeholder is laid out on the measure the catalogue lands in and the page does not
jump when it does.

**The style page has a way back at the top.** Its back link is `/styles` rather than the
browser's own Back, since a search result and a shared link both land there with nothing behind
them, and one destination serves both entry points — the catalog reads the same session answers
the flow's chooser does.

The honesty rules carry over intact and are worth not re-deriving: the footer reports whether
the catalog came from the API or from the browser's offline copy; nothing on the generating page
invents progress (the countdown ratchets earlier only, a queued job shows its real position
rather than an estimate, and the stage word is gated on the stage the server reported); the
client never adjusts a balance locally, and `ready: false` is not "no credits".

**The bar on that page is paced by the clock, not by the poll**, and that is a fix rather than a
refinement — it used to reach 90% within a few seconds of a forty-five second generation and
then sit there, which is the frozen-bar failure the screen exists to avoid. Two causes: the poll
effect was keyed on the job *object*, so every state change re-ran it and fired an immediate
poll — and a poll sets state, so the loop ran as fast as the network answered rather than every
two seconds; and the bar advanced a fixed fraction of its remaining range *per report*, which
makes its speed a fact about the network rather than about the work. `stageFill` in
`web/lib/state/GenerationContext.tsx` replaces both: a stage spends 75% of its range at a steady
rate over however long that stage usually takes, then decelerates for ever without arriving, and
a queued job holds outright because nothing has been done to it yet. **The app's
`GenerationContext` has a milder version of the same curve** (a 6%-of-remaining creep every
400ms, which parks near the ceiling about fifteen seconds into the same wait) and has not been
changed. One thing the
sandbox cannot exercise, because it publishes no imagery: **the colour grade and its mask
overlay**. `web/lib/colorGrade.ts` mirrors the app's maths and its two measured anchors — check
it against a real publish before launch.

## Architectural constraints from the spec

These are the non-obvious decisions that should shape any implementation:

**The catalog is data, not code.** Hairstyles and their mannequin images must be addable, replaceable, and expandable without shipping an app update. That means the catalog lives server-side (database + hosted image assets) and the app fetches it at runtime — never a hardcoded list bundled into the binary. Application logic references hairstyles by ID; it should not know the specific set of styles that exist.

*How this is honoured today:* the catalog is loaded once by `CatalogProvider` (`src/state/CatalogContext.tsx`) from `src/api/client.ts`. No screen imports `mockCatalog` directly, and no screen contains a hairstyle name, a category name or a hair type name.


**Hair type is the catalog's primary dimension, and the matrix decides what gets shot.**
The user declares their hair type (`app/try/hair-type.tsx`) before browsing, or takes *All Types*.
That choice is not a filter laid over the catalog: it removes the styles that are not offered for
that type at all — an afro is not a type 1 haircut — and it picks which *render* of every survivor
is shown.

Hairstyle count × hair type is deliberately **not** four times the catalog. Each hairstyle carries
a `variants` row (`HairTypeVariants` in `src/api/types.ts`, authored per style in
`src/api/mockCatalog.ts`) mapping each of the four types to the render it should be shown, so one
render can serve several types and some styles need only one:

| Row | Meaning |
| --- | --- |
| `v('straight', 'straight', 'curly', 'coily')` | three renders cover four types — the wavy version of this cut is indistinguishable from its straight one |
| `anyType()` | one render for everyone: the cut is too short, too set or too constructed for natural texture to read (buzz cut, flat-ironed blowout, box braids) |
| `v(null, null, 'curly', 'coily')` | not offered for types 1–2 at all |
| `perType()` | four genuinely different silhouettes |

That is 103 renders across the 36 styles instead of 144, and the numbers are not maintained by
hand: `npm run mannequins -- --matrix` prints the whole table, what it costs, what is already on
disk and what to generate next. It is free and needs no key — **run it before any generation
batch**. Adding a hairstyle means classifying it; a row with no `variants` falls back to a single
`any` render and `--matrix` exits non-zero naming it.

The judgement itself — does *this* cut look different on coily hair — belongs beside the haircut
and nowhere else. `src/lib/hairTypes.ts` (app) and `scripts/lib/variants.mjs` (generator) only
*read* those rows; neither may contain an opinion about a hairstyle. They are deliberate mirrors
of each other rather than a shared module, because the generator loads the catalog by transpiling
`mockCatalog.ts` on its own and nothing under `scripts/` can import from `src/`.

Two consequences worth knowing:

- **`Straight`, `Wavy` and `Curly` are no longer browse categories.** They were, and they asked
  the same question as the hair type on a second axis, which only produces empty intersections.
  Categories are about length and shape now (Short, Medium, Long, Fades, Braids & Updos,
  Trending); hair type is the only place texture is expressed.
- **A declared hair type matches its variant exactly or not at all.** An ungenerated variant falls
  through to the procedural drawing, drawn in the user's own texture — showing someone the curly
  render of a cut they asked to see straight is a wrong image, not a partial one. *All Types* is
  the one case that accepts any variant, because nothing has been declared to be wrong about; that
  is what keeps today's all-curly catalog browsable. See `variantCandidates()`.
- **Under *All Types* a card does not pick one of them — it shows them all, in turn.** Taking the
  first candidate and stopping made a cut generated in three textures look exactly like a cut
  generated in one, and the only way to find out otherwise was to open it. `<StyleCard>` cross-fades
  through the style's renders instead (`useVariantCycle` in `src/hooks/`), captioned with the types
  each one stands for, so the matrix is visible from the grid. It cycles only over variants that
  **exist and differ** — `renderedVariants()`, deduped by source, since two candidates resolving to
  one file would read as a stutter rather than as a second version — so a single-render style and
  the whole women's catalog stay still, and the procedural drawing is never cycled at all (under
  *All Types* it is drawn in the style's own texture whichever variant is asked for). The whole
  thing resolves to the first render under reduce-motion: it is the one animation here that nobody
  started and nothing stops.

  **Every card changes on the same beat**, and that is one module-level clock and one shared
  `Animated.Value`, not a per-card timer set to the same delay — cards mount as they are scrolled
  into view, so equal delays measured from each card's own mount drift apart within a screenful.
  Cards were staggered off a hash of the id first, on the theory that a grid moving in lockstep
  reads as a glitch; watched, it reads as the catalog turning a page, and the simultaneity is what
  makes it one thing the app is doing rather than several cards each doing their own. Only *when*
  is shared: each card advances one step through *its own* list, so a card scrolled into view
  mid-loop still opens on the render it would have opened on, and a two-render cut stays in step
  with a three-render one without either skipping. The clock runs only while a card is subscribed.

  **The style screen cycles on the same beat**, so a card opened from a cycling grid carries on
  rather than freezing on one texture (`app/try/style/[id].tsx`, sharing `<VariantCrossfade>` with
  the card). It stops the instant the user presses a hair type in `<HairTypeChoice>` — a choice
  outranks a demonstration — and that is the whole condition: the cycle runs only while `preview`
  is null. The control is how the cycle is *read* rather than something it bypasses, since the
  selected tile follows it. Only the hero's top layer moves: the selected tile, the thumbnails,
  the fallback drawing's texture and the type handed to `start()` all read the render the screen
  has **arrived at** (the
  outgoing one until a dissolve lands), so nothing says "Coily" over a picture that is still
  mostly curly. One consequence to keep in mind: with nothing declared, the type sent to the
  generator is whichever the hero is on when Generate is pressed.

  **That control is a chooser, not a caption.** It was a "Shown on" line over a scrolling chip row
  listing only the types the cut is offered for — a caption plus a filter strip, sitting where a
  gallery's caption sits, which is how it was read: something naming the picture rather than
  something to press. `<HairTypeChoice>` is the same state as a titled control: all four types every
  time in one non-scrolling row, the ones this cut is not offered for held in place as dimmed
  outlined slots, the selection in the app's active-filter violet rather than in the solid ink it
  uses for buttons. A row whose length changes per style is a list of what exists; a row that is
  always the same four is a question with four answers. The one line under it says the thing the
  row cannot: that a cut with a single render will not change when the selection moves.

  **Both adjustments share one card, because the second one was below the fold.** Hair type and
  hair length were a card each, stacked, each with its own border, its own padding and a heading
  over a full sentence of caption — nearly 400 points between them, under a hero that was a flat
  `width * 0.68` and so 352 points tall on its own. The length slider was therefore off the bottom
  of every phone, and a control found only by scrolling is a control most people never find. The
  fix is `<ControlCard>` plus three cuts that each pay for themselves:

  - **One card, one hairline.** The two ask the same question — how should this cut be shown — so
    two bordered cards were claiming they were two subjects. `<ControlCard>` takes children and
    rules a full-bleed hairline between whatever it is actually handed, so a cut with no length
    row is one section and no seam, and a cut with neither renders nothing.
  - **The question and the verb on one line.** `<ControlHeading>` keeps both things that made the
    row read as a control rather than a caption — the name in ink, a verb saying what to do with
    it — and sets them side by side instead of stacked. Do not drop the verb to save the last few
    points; that hint is what the paragraph above is about.
  - **The cut's name moved into the header.** `<Header>` takes `title` and `right`, and was
    carrying only a step counter, so the 24pt heading and the favourite heart cost a row of their
    own for something the header had an empty centre for.

  `HERO_ART` is what the rest is budgeted against: capped by the window's *height* as well as its
  width, since the height cap is the one that binds on a phone. The whole screen is arithmetic
  against the fold — a change to the card's copy, the tile height or the hero fraction can put the
  slider back under the footer on a small phone, so check a 4.7" viewport before shipping one.

**Length is a slider, and `medium` is an anchor rather than a midpoint.**
A minority of cuts are offered at two or three lengths (`lengths` on the hairstyle,
`HairLengthOffer` in `src/api/types.ts`) and the style screen shows a slider for them.
Most of the catalog has no row and no slider: a fade's variable is its fade height, and a
Caesar cut that got longer would stop being one. The row is **per gender**, because the
men's and women's readings of one cut do not travel the same distance.

The rule the whole design rests on: **every render already on disk was shot from a prompt
that says nothing about length**, so what is there is the cut *as the catalog authored it*
— and that is what `medium` names. Three consequences follow, and they are why this was
cheap to add:

- **Every offered range must contain `medium`.** A range without it would open the screen
  on a length the catalog has never shot. `SM` and `ML` are the two-step ranges for cuts
  that only travel one way — a Pixie Cut grown out is a bob.
- **The anchor keeps the path it already has.** `short` and `long` go in
  `<style>/<variant>/<length>/`; the anchor stays loose in the variant directory. No
  migration of 356 renders and 356 masks, and a style with no length row is simply a style
  whose only render is its anchor. `lengthDir()` in `scripts/lib/lengths.mjs` is the one
  place that decides it.
- **The untouched slider changes nothing.** `effectiveShape()` has no `medium` branch, so a
  screen at rest draws exactly what it drew before length existed.

**Length falls back to the anchor; hair type does not.** That is not an inconsistency — it
is the same rule applied to two different things. A hair type is *declared*, so a curly
render shown to someone who said coily is a wrong image and falls through to the drawing. A
length is *asked for*, in a control the user is holding, on a cut whose anchor render they
were already looking at; dropping to a line drawing mid-drag is worse than showing the cut
at its usual length. The screen says which it got — `renderLength()` reports the resolved
length, and when it disagrees with the asked-for one the control carries a line saying so.
That line appears per stop and clears itself as renders land, with nothing to remove.

**One sheet per style x variant x gender, holding every length.** `--lengths` composes a
4 x N grid — one row per length, one column per angle — from the same four approved base
heads, edits it in a single generation, and cuts it into one render per length x angle.
Three separate sheets would be three independent rolls, and a length slider is *more*
exposed to drift than the angle set is: the user A/Bs the images directly by dragging, so a
wandering fringe reads as the slider changing the haircut rather than its length. The
prompt says so twice, in the grid's own terms — down any column only the length changes,
across any row only the camera moves (`styleLengthSheetPrompt`).

**The frame has to grow with the panel count, and that is what makes it cheap.** Twelve
panels in the 1K frame the four-view sheet uses would be 256x256 against today's 512x512 —
the same lost-detail failure the try-on hit, where a fade's stubble field lands under a
pixel and comes back as a smooth mass. So a length sheet is asked for at **2K**, where a
4:3 frame is 2048x1536 and a panel is exactly 512x512. That is **$0.12 for twelve panels
against $0.24 for three 1K sheets of the same twelve** — half the money, the same
resolution, and a set that is internally consistent where separate sheets could not be.
`--resolution` overrides the tier; the four-view path sends no tier at all and is byte for
byte the request it always was.

**The length difference has to be big, and wanting it is not enough.** The first version of
the prompt asked for rows "noticeably shorter" and "noticeably longer" and told the model to
keep them unmistakably the same haircut. Those two sentences fight, the second wins, and the
sheet comes back as three rows a viewer has to compare side by side — a slider that appears
not to respond, which is the exact failure the app spends a line of copy on elsewhere. Two
fixes, both needed:

- **Lengths are stated as ratios against the middle row** — half and twice — not as
  adjectives. A ratio means the same thing for a buzz cut and a wolf cut, which
  "four inches" does not, and the prompt has to stay derived from catalog data.
- **"The same haircut" is scoped to identity, not amount**: same parting, shaping, hairline
  and finish, explicitly *not* the same quantity of hair. `LENGTH_CONTRAST` closes with
  "if in doubt, exaggerate" — the mirror of `baseHalfFromFrontPrompt`'s "if in doubt, turn
  it less", and for the same reason: a known bias in one direction is worth spending words
  against.

**And it is measured, because wanting it is still not enough.** A length sheet has two silent
failure modes, not one. A bald panel is a head the model skipped; a *flat* sheet is a range
it never drew, and nothing in the response says so. `lengthContrast()` takes the per-panel
coverage `inspectLengthSheet` already computed, means it per row, and trips on either a step
that did not move (`MIN_LENGTH_CONTRAST`) or a short→long spread that is too small overall
(`MIN_LENGTH_SPREAD`). Both are needed: the second catches the case every step clears the
floor and the range is still invisible. A sheet that trips either is **reported, not re-rolled**:
the generators shoot each sheet exactly once, name what came back wrong, and leave the decision to
pay for another one to whoever is running them. Automatic re-rolls were up to 3x the cost of a
batch and the money was spent before anyone had looked at the image.

Both thresholds are **measured from real sheets, not guessed** — the numbers and the sheets
they came from are in `lib/sheet.mjs`. The one that set the floor is `afro/coily`, which came
back at x1.09 per step and a x1.20 spread: it cleared an earlier, more lenient floor
comfortably and still looked like one haircut three times. `--check` re-measures anything
already on disk for free and prints the re-shoot commands to run by hand.

**The anchor row is re-shot and replaces what is there.** Three lengths only mean anything
as a set if they came out of one image, so the medium row has to replace the separately-shot
medium it sits between. That is the real cost of the dimension: 29 style x gender pairs, 78
sheets, about $9.36. `--plan` prints one command per pair, derived from the catalog's own
rows rather than typed out, with what each costs and what is already shot. It is free and
needs no key — **run it before any length batch.**

**The picker's own imagery is a second, separate generation.** Before any of the above the user
has to answer *what does my hair do*, and `app/try/hair-type.tsx` shows a generated example of
each pattern to ask it — one set per gender, since gender is answered a step earlier. That is not
catalog imagery and does not go through the catalog's pipeline:
`scripts/generate-hair-type-examples.mjs` makes **two images in total**, each a 2×2 grid of the
four types on one head, cut here into `assets/hair-types/<gender>-<type>.png`
(`npm run hair-types -- --gender male`). The subject is the texture, not a haircut — every panel
wears the same plain hair — a short crop for men, chin length for women, since a length that reads
as the wrong gender answers the wrong question — so the pattern is the only variable; the crop is tight on
the head rather than framing the display base, and it is one text-to-image generation rather than
an edit of the approved base sheet. The object is shared, though: `BLANK_FACE`, `MATERIAL`,
`LIGHTING`, `BACKDROP`, `HAIR_COLOUR` and the four `HAIR_TYPES` descriptions are imported from
`scripts/lib/prompts.mjs`, so the picker and the catalog are the same mannequin under the same
light and a reworded type is reworded in both. No masks and no colour grade: an example of a
texture has no shade to be put in. Rows fall back to the type's icon until a full set exists for
that gender, all four or none — see `src/lib/hairTypeExample.ts`.

**Catalog imagery uses neutral mannequins, never photos of real people.** Every hairstyle is modeled by an AI-generated faceless mannequin: no facial features, no identifiable ethnicity, neutral skin/face styling, male and female variants, and a consistent visual style across the whole catalog. The point is to keep the user's attention on the haircut rather than on the person modeling it, so consistency across the catalog matters as much as the quality of any single image. Match `App-reference.png` when generating new mannequins. Consistency now has to hold across hair
type as well: the coily shot of a cut and its straight shot are the same head, the same light and
the same crop, and only the hair type line in the prompt differs.

**Gender is the one thing the base sheet cannot carry, and the sheet prompt has to say it.**
Sheet mode's whole argument is that the reference image is the specification — the head, the
angles, the crop and the light are inherited rather than described. The base sheet does supply a
woman's *head*. It does not supply a woman's *cut*, and a hairstyle **name is not
gender-neutral**: handed "Messy Fringe" and nothing else, the model returns the men's reading of
that name onto whichever head it is given. `styleSheetPrompt` carried no `gender` at all, so the
male and female prompts for a style were byte-identical — the manifest still shows that for every
render shot before this — and every style offered to both genders came back as one haircut twice,
with the women's render looking like the men's. Styles whose name already carries the gender
(Blunt Bob, Pixie Cut, Textured Lob) were the only ones unaffected, which is the shape that gives
the bug away. `GENDER_CUT` in `scripts/lib/prompts.mjs` is the fix: it genders the cut wherever
the prompt names it ("women's Messy Fringe") and adds one `Worn by:` line to the specification
block. It is deliberately *not* `GENDER_PROPORTIONS`, which describes the mannequin sculpt — the
sculpt is in the reference and the prompt spends a paragraph forbidding changes to it. **The
female renders of every unisex style on disk are wrong and need re-shooting**; that is a
generation, not a re-grade.

**Colour is a grade, not a generation.** A hairstyle has no colour; the catalog is shot in a fixed
shade and the app maps that render onto the chosen shade at display time.

There are **two** such shades, not one. `any`, `straight` and `wavy` are espresso; **`curly` and
`coily` are shot black**, because espresso reads as a muddy mid-brown on a dense texture — a coil
or a tight curl is mostly self-shadow, with very little lit surface left to carry a hue. It showed
on type 4 first and worst, so coily went black on its own; curly had the same problem a level down
and followed. That is still not colour-per-style: no hairstyle has its own shade, and nobody picks
these. It only means the grade has two anchors instead of one, so `<Mannequin>` resolves the
render's variant first and grades from `baseHairColor(variant)` (`BASE_HAIR_COLORS` in
`src/lib/constants.ts`) rather than from one catalog-wide constant. Grading a black render from the
espresso anchor overshoots every target, which is the bug that indirection exists to prevent. It is
also why the app does not simply sit at "as shot" while the picker is out of the UI: that is two
shades, not one, so the session defaults to jet instead (`DEFAULT_HAIR_COLOR_ID`) — the espresso
renders are graded onto black and the black ones, whose anchor is already a level or two off jet,
barely move: on iOS and web the factors fall inside the identity epsilon and the render is shown
untouched. The whole
mechanism is one `feColorMatrix`: scale each channel's distance from white by
`c = (1 - target) / (1 - base)`. A new shade is a row in the catalog's colour list, not a
re-shoot: never add a colour by generating a second render of a style. Every anchor is *measured*
from the renders in `assets/mannequins/`, not copied from the prompt — `scripts/measure-hair-tone.mjs`
prints one mean per variant and is the only thing that should ever set them. The procedural drawing needs no grade; it
is painted in the chosen hex directly.

**The grade is held to the hair by a mask.** Every render has a `<gender>-<angle>-mask.png` beside
it in its variant directory — greyscale, white where the haircut is — so `<Mannequin>` can draw the render untouched and
lay a graded, masked copy over it. Only the haircut changes; the mannequin and the backdrop are
the original pixels. The masks are not painted by hand and not generated by a model: they come
from `scripts/lib/hairMask.mjs`, which separates backdrop, plastic and hair on luminance and then
fixes the two things luminance alone gets wrong, by region rather than by pixel — a specular
strand sealed inside hair is hair, and the shadow under the jaw sealed inside plastic is
mannequin. That works because of the house style (dark hair, white matte plastic, flat white
ground), so if the imagery ever stops being dark-hair-on-white, this is what breaks first.

Masks are kept in step automatically: `writeRenderModule` computes one for any render whose mask
is missing or stale before it writes the module that points at the render, so a generator run or
a `npm start` is enough. A render with no mask is graded whole rather than not at all — the old
behaviour, which is close but tints the head slightly and lands hardest on the jaw shadow.

**The app has a light and a dark scheme, and the palette is a runtime value.**
Not to be confused with the paragraphs above it: those are about the colour of *hair*, this is
about the colour of the *app*. They do not interact — a hair colour is catalog data graded onto a
render, and the scheme is a UI palette. The one place they touch is `plate`, below.

`src/theme/tokens.ts` holds `lightColors` and `darkColors`, and `src/theme/ThemeContext.tsx`
picks between them. Settings has a three-way control — **System / Light / Dark** — defaulting to
`system`, which is a deferral rather than a value: the phone decides and *keeps* deciding, so a
device on a dusk schedule flips the app with it. The choice is one AsyncStorage key
(`luvo.theme.v1`) and `app.json` is `userInterfaceStyle: "automatic"`, without which iOS never
reports dark at all.

**The palette is measured off the launcher artwork, not chosen beside it.** `assets/Luvo-icon.png`
is a violet-to-pink figure on a near-black tile, and three anchors sampled from the core of its
strokes are what the whole scheme is built from: violet `#A98CFB` (H256), pink `#FC73AC` (H335),
tile `#090710` (H253). Violet is `accent` at every step — light mode takes it deeper down its own
hue until white body text clears AA on it (6.1:1, where the brass this replaced managed 4.7), dark
mode uses the measured value as-is. **Pink is only ever the far end of a gradient**: a two-colour
brand still needs one of them to be the colour a button *is*, and pink dark enough to carry white
text is maroon, so the pink is spent as `accentGlow` on the two gradients that already existed —
the progress ring and the generating screen's frame — which now draw the icon itself. The neutral
ramp carries the tile's hue under 3% saturation. That cap is the load-bearing part and it is the
same constraint the warm bone ramp was written against: the catalog is dark hair on flat white, so
a neutral with real chroma in it reads as a tint laid over the renders. `plate` did not move, so
nothing directly behind a render did either.

Three things outside `tokens.ts` are part of the palette and do not follow it automatically: the
`rgba()` scrims that are literal copies of `ink` (they are the dark-on-purpose family — a pill over
a photograph, a caption gradient), `SCAN_GRADIENT` in `GenerationStage.tsx`, which is the light
accent written out because a module constant may not read the palette, and the two splash
`backgroundColor`s in `app.json`, which are `canvas` in each scheme. Re-deriving the palette from
new artwork means re-checking those four places.

The three things that made this more than swapping a hex map:

- **`StyleSheet.create` runs at module load, so no stylesheet may read the palette at module
  scope.** That is the whole reason there is no `colors` export from `@/theme/theme` any more.
  Repointing the old export at a live palette would have compiled and silently left every screen
  in the app frozen at whatever it was imported with; *deleting* the name is what made the
  compiler list all 38 files. What replaced it is `makeStyles(({ colors, shadow }) => ({...}))`,
  written at the bottom of a file exactly where the old `StyleSheet.create` sat and read as
  `const styles = useStyles()` at the top of the component, plus `useColors()` for the inline
  cases. Both sheets are built once each and cached, so flipping the scheme is a context change
  and a map lookup — the factory is called at most twice and must be pure.
- **"Dark" meant two different things and both were spelled `ink`.** A near-black *text* colour
  and a near-black *fill* invert in opposite directions, and one token cannot do both: text goes
  light, but a selected chip that stayed dark on a dark canvas stops reading as selected. So the
  fills are `inkFill` / `onInkFill` (white on near-black in light, near-black on near-white in
  dark),
  and `stage` is the third case — surfaces that are dark *on purpose* in both schemes, where
  `onDark` stays white because what is under it is still dark: the welcome hero, the finished-look
  toast, a scrim over somebody's photograph. The same split runs through the accent: `accent` is
  the fill with `onAccent` on it, `accentInk` is the brand violet used as a *label*, deep in
  light and light in dark. A single violet cannot be both a panel and legible text on that panel.
- **`plate` does not invert, and neither does `<ShareCard>`.** Every catalog render is shot on
  flat white, so a dark ground under one would frame a bright rectangle of the render's own white
  — `plate` is that ground and it is a constant, not a palette entry. `<ShareCard>` is the one
  component that reads `lightColors` directly and on purpose: it is captured as an image and
  posted somewhere else, so what it looks like is a fact about Luvo's branding rather than
  about the phone that made it. Two people sharing the same look must produce the same picture.

**`plate` is `#FFFFFF`, and every surface that holds a render is one.** That was the open design
call — the grid card's image area was `surfaceAlt` and the style screen's hero and angle tiles
were `surface`, so after dark a published render was a white square inside a charcoal box, with
the seam falling exactly on the render's own edge. It was settled once the renders were on screen,
and the answer is the one the token already implied: match the imagery rather than the scheme. A
tinted plate does not do it — a warm `#EFE9E1` left a visible square in *both* schemes, and a
cool one tinted to the palette does the same — so the
plate is the render's own white, and the card's border, its meta row and the canvas behind it are
what carry the scheme. The surfaces on it: `<StyleCard>`'s image area, the style screen's hero
card and its four angle tiles, `<MannequinBadge>`, the hair-type picker's examples and the sample
photo's stand-in.

Ink on a plate does not invert either, for the same reason `onDark` does not: `onPlate`,
`onPlateMuted` and `onPlateAccent` are taken from `lightColors` so a caption on a plate is not
bone-on-white after dark. That is the whole cost of the decision, and it is bounded — anything
that draws *on* a render needs them, and nothing else does. The skeletons are deliberately
outside it: `<Skeleton>` is one grey on every ground by design, so the hero placeholder keeps
`colors.surface` and the plate arrives with the render it belongs to.

**`half` is the hero, and it is a turn of the front head — never a copy of the reference.**
`half` is `HERO_ANGLE`, so it is the image on every catalog card and at the top of every style
screen. It used to be produced by telling the model to keep `scripts/reference-head.png`'s pose,
on the stated theory that the reference was already at the wanted angle. It is not: the reference
is turned far enough that the face plane goes edge-on and the subject is the back-right of the
skull. So the base head reproduced a *rear* three-quarter, every hairstyle inherited it by being
an edit of the composed base sheet, and the catalog ended up with two profiles and no hero.

The fix is neither to describe the angle (it comes back at 50-60 degrees every time) nor to
inherit it, but to make it a small delta from an image that is already right:
`baseHalfFromFrontPrompt` edits the approved dead-on `_base/<gender>-front.png` and asks only for
a 25-30 degree turn, with the overshoot spelled out as explicitly as the target. Anything that
changes the base heads means re-shooting every style built on them.

**Two distinct image-generation paths.** Mannequin catalog images are generated ahead of time and stored as assets; user previews are generated on demand from the user's uploaded photo. Keep these separate — they have different latency, cost, and caching characteristics.

**The preview is a job on the backend, and the photograph is in flight rather than at rest.**
This is the phase-2 slice that closed the security note below. `docs/preview-generation.md` has
the whole argument; the decisions that shape any change to it are these.

*The constraint, stated honestly.* A job that survives the app being closed cannot hold the
photograph in the app, so for the forty-odd seconds the model is working the image has to be
somewhere the server can reach. There is no design that avoids it. What is achievable — and what
the code commits to — is that the photograph goes from the phone straight into a **private
bucket with no public domain and no CDN**, under a 32-byte random key, is read once through a url
that expires in minutes, and is **deleted the moment the job settles**, success or failure or
cancellation alike. Never in Postgres, never public, never in a log line.

*The scrub is a state transition, not a cleanup job.* Every path out of `running` nulls
`photo_key` in the same statement that sets the status, so there is no ordering in which a worker
crashes and leaves a settled job with a photograph attached. `check-previews.mjs` walks every
branch and asserts `unscrubbed()` is empty. The sweeper catches objects whose *row* was lost; it
is not the mechanism. **If you add a status or a path out of `running`, that assertion is the
thing to keep passing.**

*The result belongs to the phone.* A finished preview is **collected**, not merely downloaded:
the app writes it into its own documents directory first, then tells the server, and the server
deletes its copy. Download first so nothing is lost, acknowledge second so nothing is kept. After
that the only copy in existence is on the phone and it stays there until its owner deletes it —
which is also why `saveLookImage` writes to `Paths.document` and not `Paths.cache`, where the OS
is free to delete a saved look whenever it wants space. `PREVIEW_RETENTION_DAYS` is a hand-off
window for a phone that never came back, not a retention policy.

*No image bytes pass through the API process.* The phone uploads to a presigned url and downloads
from one; the API handles small JSON. That is the entire scaling story — 1,500 simultaneous
submissions are 1,500 rows and 1,500 HMACs, and the ~450 MB of photographs goes to Cloudflare.
The one exception is the worker copying a finished image from fal into the bucket, once per job.

*The queue is Postgres, claimed by compare-and-set.* `update ... where id = $1 and status =
'queued'` — two workers produce one winner and one zero-row result at any isolation level. It was
`for update skip locked` first; the guard is simpler, strictly stronger for this shape, and runs
on the in-memory Postgres the check uses, which matters because a queue whose claim path cannot be
tested is a queue with no test.

*Polling, not webhooks, and the number is the reason.* fal sets the account's concurrency limit
from credits purchased in the last four weeks: **10 on this plan**, 40 at the top of the published
table. Ten in-flight jobs polled every two seconds is five requests a second. A webhook would add
a public endpoint, a signature to verify, a replay window and a delivery-failure mode needing a
polling reaper behind it anyway. Revisit above ~100 concurrent. `FAL_MAX_INFLIGHT` is that real
limit and not a safety margin — submitting past it buys rejections, not throughput.

*A device secret, not accounts.* The phone mints 32 random bytes into the platform keystore and
sends them as a bearer token; the server stores only the SHA-256. It identifies a device, not a
person, and it proves nothing about the caller being a real copy of the app — which is what costs
money now that our endpoint spends it rather than a key in the bundle. **There is no quota yet**,
and a per-device daily limit plus a global spend ceiling is the minimum before this is public.
`devices.user_id` exists and is unread, so real accounts are a backfill rather than a migration.

*The prompt is copied, not mirrored.* Everything else crossing the app/server boundary is a
hand-written mirror kept honest by a check. `src/lib/tryOnPrompt.ts` cannot be: it is authored
English prose, and two copies that have drifted apart are two different haircuts with no test able
to say which was meant. `server/scripts/sync-shared.mjs` cuts it (and the import-free
`imageSize.ts`) into `server/src/generated/`, rewriting only the type-import header, and
`npm run check` fails if the copy is stale. **Edit the app's file; never the generated one.**

**The wait is a screen, and it never invents progress.** Pressing *Generate my preview* used to
queue the job and drop the user on Profile, where a thirty-second round trip was a two-inch tile
reading "Processing…" over a bar that froze between polls. The payoff was not on screen and there
was nothing to watch, so the flow's last step was an exit. `app/try/generating.tsx` is that same
job with the payoff in front of the user — their photo, full size, under a scan, inside a frame
that closes as the work lands — and it opens the result itself when the job resolves.

It is a *view* onto the job, never a gate. Both exits sit in the footer, neither touches the job,
and the processing tile on Profile is now a way back in rather than a lesser copy of the wait.
Leaving costs the view, not the work.

The rule that keeps it honest, and the one to hold on to if this is ever reworked: **every moving
thing on that screen is either the generator's own report or is visibly not a claim about it.**
The frame, the percentage and the clearing scrim are `job.progress`, eased over slightly longer
than the gap between polls so they are never still — easing is not invention, it is the same
number drawn continuously. The countdown ratchets: each report may only pull the deadline
*earlier*, because the naive estimate climbs whenever progress holds still, and a remaining time
that grows while somebody watches it is worse than no estimate at all — overrunning becomes
"Almost there" rather than resetting.

The scissors are the other kind. A pair of blades snips its way across the photo, riding the
bright edge of the band that sweeps down it, and neither motion is tied to progress: their job is
to separate "slow" from "hung", and scissors that slowed with the queue would read as the app
struggling rather than as the queue being busy. They are drawn as two `Animated.View`s whose
viewBox is centred on the pivot — rotating each view about its own centre *is* rotating a blade
about the screw — because an animated SVG transform string costs a re-render per frame and a view
transform does not.

Under them is the part that had to be designed carefully, because it is a lie in most apps: a word
that changes every second or so. `STAGE_WORDS` is **one pool per `GENERATION_STEPS` entry, gated
on the job's real `stepIndex`**, so the word on screen is always a fair description of the stage
the generator reported — which word it is, is pacing. A single list cycled on a timer is a fake
checklist with better manners; it says "Tapering" while the request is still queued. The words are
a barber's rather than a machine's on purpose: "Applying the hairstyle" is what the software does,
"Tapering" is what the user asked for. Keep each pool long enough to outlast its stage, since a
pool that runs out visibly loops, and a visible loop is what gives a timer away.

The predecessor to all of this was a ticking three-row checklist. It was honest and it was dull —
it read as a build log — and a wait nobody enjoys watching is a wait they leave. A fake percentage
or a timed fake word stream would be easier than either and would work exactly once.

**Waiting for content is a skeleton, never a spinner.** The same rule as the paragraph above,
applied to every other wait in the app: a spinner says something is happening and nothing about
what, and the page under it reflows completely the moment the data lands. So a wait for content is
drawn as the layout that is coming, with its content not yet in it — `src/components/Skeleton.tsx`
is the primitive and the compositions live *beside the layouts they mirror* (`<StyleCardSkeleton>`
in `StyleCard.tsx`, `<StyleScreenSkeleton>` off `src/lib/styleLayout.ts`, the grid in
`CatalogBrowser.tsx`, the rows in `hair-type.tsx`), so a change to a layout is a change to its
placeholder. `<LoadingState>` is gone; `<Button loading>` is still a spinner, because an *action*
in flight has no shape to stand in for.

Two rules keep it honest, and they are the ones to hold on to:

- **A placeholder may state the layout, never the data.** Six cards, four hair types, four angle
  tiles — those are facts about the screen. How many styles came back is not known yet, so the
  count row shows a placeholder rather than "0 styles", and Profile's favourites grid holds a card
  per saved id rather than claiming "No favourites yet" while the catalog is still in flight.
- **Nothing in a placeholder moves except one shared breath.** One module-level clock for every
  block on screen, for the reason `useVariantCycle` shares its own — a dozen blocks each pulsing
  from their own mount fan out into noise — and it resolves to a still frame under reduced motion
  (`useReducedMotion`, now shared by both). No bar, no percentage, nothing that could be read as
  progress: there is none to report while a fetch is in flight.

**The preview is shown the haircut, never told it.** This is the whole design of the try-on and
the reason the catalog's renders exist at all beyond the browse grid. The model is handed the
user's photo as the image to edit and the catalog's own mannequin render of the chosen cut — the
`half` hero, the image on the card the user tapped — as reference, plus the user's hair type in
words. The instruction says only: change the hair to match the reference, return the same
photograph otherwise.

Naming the style instead would get *a* buzz cut, differently every time, and never the one on
the card the user tapped. So the hairstyle's name and description go in as a caption on the
reference, explicitly subordinate to it — and when a style has no render at all, the prompt
falls back to the description and says so in its own wording. That is the one weak case, and it
disappears as the catalog fills in.

The instruction lives in `src/lib/tryOnPrompt.ts` and nowhere else. `scripts/try-on.mjs` runs
the same generation from a terminal by importing *that file* — the type-only-imports trick
`lib/transpile.mjs` already used for `mockCatalog.ts` — rather than keeping a copy, because a
script whose job is to test what the app sends must send what the app sends. Iterate there, not
on a phone.

The variant is still resolved through `variantCandidates()` exactly as the browse grid resolves
it, and the reference is taken from that one variant (`mannequinViews()`) — a curly front and a
coily back would be two haircuts handed to a model asked for one, the same failure
`mannequinMask` avoids a level down.

**Two images, and this is the load-bearing part.** The first version sent all four angles, on the
reasonable-sounding theory that more views of one haircut can only help. It failed completely:
with five images in the request the model stopped treating the photograph as the thing being
edited and started *composing* across the set, and returned a studio portrait on the mannequin's
grey ground, at the mannequin's crop and aspect ratio, wearing a stranger's face. Four references
outvoted one photograph.

The request has to read as *here is a picture, here is a haircut, put the second on the first*,
which is two images. `REFERENCE_VIEWS` in `src/api/tryOn.ts` is where that is enforced, and the
comment there is the one to read before changing it.
`npm run try-on -- --views front,half,side,back` reproduces the failure on demand — it exists to
re-measure the decision, not to undo it.

What one view costs is more than it first looked. `HERO_ANGLE` is `half`, which is *supposed* to
be a 25-30 degree turn — but every render on disk predates the `baseHalfFromFrontPrompt` fix, so
the `half` shot is a full profile and a mirror of `side`. The one reference the generator sends
is therefore face-on-edge, with no front hairline and no fringe in it.

The fix is a single reference image that *contains* four views — the composed
`<gender>-sheet.png`, downscaled and bundled — which keeps the count at two. Re-shooting the
base heads would fix the hero angle but means re-shooting every style built on them.
**Neither is fixed by adding images back**, which is the one thing already measured and known to
fail.

Two more things follow and are worth keeping:

- **The instruction is authored prose, not a derived string.** `INSTRUCTION` in
  `src/lib/tryOnPrompt.ts` is written by the product owner and edited as prose. The code around
  it contributes only what the author cannot know in advance: which image is which, the cut's
  name, the user's hair type, and the colour rule.

  Keep it short. The version before it ran to four hundred words enumerating every facial
  feature to preserve and every property of the photograph to leave alone; the model read the
  list as subject matter and produced a different person wearing a beard the prompt had named
  while asking for it to be left alone. A long list of things not to change is a list of things
  to think about.
- **The reference falls back across variants; the display never does.** `variantCandidates()` is
  strict — a declared hair type matches its variant exactly or falls through to the drawing,
  because the wrong render on screen is a wrong image. Applied to the *generator's* reference
  that rule was doing real damage: the catalog is shot curly and part-way through coily, so 44 of
  the 99 male style x hair-type combinations had no render for the declared type, and every one
  of those previews degraded silently to the name-only prompt. Against four paragraphs of "keep
  the photograph exactly the same", that reliably returns the photograph exactly the same — the
  user asks for a mid fade and nothing happens.

  The reference is not on screen and is not doing the same job. It supplies *geometry*, which is
  the part of a cut that survives a change of texture; the texture is supplied separately, in
  words, by `hairTypeLine`, and when the two disagree the prompt says so outright rather than
  leaving the model to average them. So: the right variant when it exists, any variant of the
  same cut when it does not. 99 of 99 now carry a reference. The strict rule still governs every
  pixel the user actually sees.
- **The prompt needs one positive noun, and the cut's name is it.** The name was left out for a
  while, on the principle that the reference image is the specification and a name only invites
  the model's generic idea of that cut. The principle holds; the omission did not. It left every
  emphatic sentence in the prompt a *preservation* sentence — keep exactly the same, do not
  modify or regenerate — and against that wall, handing the photograph back untouched is a
  defensible reading of the request. The model took it, often enough to notice.

  So `styleLine` names the cut as a label on the reference rather than as the brief, and follows
  it with the sentence that actually fixes the no-op: the hair *must visibly change*, including
  where that means cutting or removing what is there. Nothing else in the prompt gives the model
  permission to change anything.
- **The reference is a plastic object, and the prompt has to say so.** The instruction closed by
  asking for a haircut matching the reference "in shape, length, texture, and styling" — which
  reads as copy the material along with the cut, and the model did: hair that looked sculpted
  rather than grown, a hard edge at the hairline, one glossy mass with nothing leaving it. The
  fix is a paragraph naming the reference as a mannequin and asking for real hair in the
  photograph's own light, plus dropping "texture" from that closing list, where it was being read
  a second way. Texture in this prompt means curl pattern and belongs to `hairTypeLine`.

  Half the problem was never wording. nano-banana-2 generates at 1K unless asked, and a haircut
  lives in strand-level detail — a fade's stubble field, the separation at a hairline — which at
  1K, on a head that is part of a frame, lands under a pixel and comes back as a smooth mass.
  `TRY_ON_RESOLUTION` asks nano-banana for 2K: 1.5x its base rate, $0.12 a preview rather than
  $0.08. That was the app's setting for exactly as long as nano-banana was the app's model —
  see the model section below, which now sizes the same problem with a quality tier instead.
  The constant is dormant rather than dead: it is what a switch back to nano-banana comes back
  to, so going back does not also mean rediscovering the 1K bug. The catalog generators are
  untouched and still shoot at their own default.
- **Colour is not sent.** The catalog's shade is a studio convention and the session's `colorId`
  is a *display* default (see below) — neither is a statement about this user's hair, so the
  preview keeps the colour in their photo. `GenerateRequest.hairColor` is the seam for the day a
  picker exists; it is deliberately not `options.color`.

`src/api/tryOn.ts` is where this is assembled and `src/api/fal.ts` is the queue client — a
near-copy of `scripts/lib/fal.mjs`, mirrored for the same reason `hairTypes.ts` mirrors
`variants.mjs`. **The key is in the app bundle** (`EXPO_PUBLIC_FAL_KEY`) and anyone with the app
can read it out; that is a prototype arrangement with an expiry date, and moving the call behind
the API is most of what phase 2 is.

**The try-on is on `openai/gpt-image-2/edit` at `quality: "medium"`, and the tier is the whole
story.** `TRY_ON_MODEL` and `TRY_ON_QUALITY` in `src/api/tryOn.ts`.

This model was here before and was sent back for costing 2.5x: one measured preview at about
$0.20 against nano-banana-2's $0.08. That measurement was of the **default** tier. gpt-image-2
prices by quality and by size, `high` is the API default, and nothing ever required accepting
it. At `medium` and 1920×1088 the same request is about **$0.053** — under nano-banana-2 at 1K
($0.08) and well under half what this app was paying at 2K ($0.12). The old note read as though
gpt-image were categorically the expensive option; it is the expensive option at `high`.

One of the three objections recorded against it has expired outright. Output sizes were a fixed
set (1024², 1536×1024, 1024×1536), so an odd-shaped photograph came back resampled. `image_size`
now defaults to `auto`, inferred from the input, and takes concrete sizes on any multiple of 16
up to a 3840px edge. **1920×1088, not 1920×1080** — the pricing table names the bucket after
1080 and 1080 is not a multiple of 16.

Two objections stand, and neither was resolved by this change:

- **gpt-image re-renders the whole frame** rather than editing pixels in place, so "return the
  same photograph otherwise" is approximated and identity drifts a little every generation.
  That is what the face paragraph in `tryOnPrompt.ts` is for, and it must not be deleted while
  this model is the default. The real fix is `mask_url`, which this endpoint takes and
  nano-banana has no equivalent of: confine the edit to the hair and the drift stops being
  something prose has to prevent. It needs hair segmentation on the *user's* photo, which does
  not exist here — the masks in `assets/mannequins/` are for catalog renders. It is the obvious
  next move.
- **The reference and the reader are no longer the same family.** Every render in the catalog
  is shot on nano-banana, and a preview request hands one of those renders to gpt-image. That
  was the argument for going back last time and it was never re-measured against the current
  prompt. Re-measure it rather than assuming it either way; that is what `--model` is for.

**The output is asked for in the photograph's own shape, and that is a comparison fix rather
than a formatting one.** `TRY_ON_IMAGE_SIZE` is `match`: `src/lib/imageSize.ts` takes the
photo's measured dimensions and returns the nearest size gpt-image will accept with the same
aspect. The preview is wiped against the original in `<BeforeAfter>` and both halves are drawn
`contentFit="cover"`, so two different aspects are cropped by two different amounts: the head
lands at a different scale on each side of the wipe and the model gets blamed for zooming the
photo when all it did was return the frame it was asked for.

It replaced a fixed 1920×1088 — a landscape frame being handed portrait selfies, which is the
resampling failure above reached by a different route. The **pixel budget is held constant** at
that frame's 2,088,960, so only the shape varies and the price tier does not: a portrait
1248×1664 and a landscape 1664×1248 are the same money. Aspect is clamped to 3:1 because the
model will not go past it, and a photo that cannot be measured sends no size at all and lets
`auto` infer one — never a guessed shape.

The arithmetic is *imported* by `scripts/try-on.mjs` through `lib/transpile.mjs`, not mirrored:
`imageSize.ts` has no imports, so it qualifies, and a second copy of it would be a second answer
to the question it exists to settle. Keep that file import-free. `EXPO_PUBLIC_FAL_TRY_ON_IMAGE_SIZE`
still takes `auto`, a `WxH` frame, a preset name, or empty for no field at all.

The shared part of the request body is still identical for every model (`prompt`, `image_urls`,
`num_images`, `output_format`), so the model is one constant and nothing downstream of it.
Sizing is the exception: the field names do not overlap at all, so `modelOptions()` selects them
by model — `quality`/`image_size` for gpt-image, `resolution` for nano-banana — rather than
sending all of them and trusting each model to ignore the others. An unknown field is not
reliably a no-op, and a request that fails schema validation reaches the user as a failed
generation. `scripts/try-on.mjs` mirrors that function and takes `--quality`, `--image-size` and
`--resolution` so a terminal run is still the app's request.

The try-on keeps its own env vars rather than sharing the generators' `FAL_EDIT_MODEL`, so an
experiment on one cannot silently re-point the other — a generator's model change means
re-shooting 103 renders.

**The catalog changed models mid-shoot, and it was not re-shot.** Everything up to and including
men × curly was made with `fal-ai/nano-banana/edit`; men × wavy onward is `nano-banana-2/edit` at
$0.08 an image instead of $0.039. On the face of it that contradicts the paragraph above this one —
consistency across the catalog is load-bearing, and a grid showing two models' idea of hair is the
same class of bug as a grid showing two shades. What makes it survivable is **sheet mode**: a style
is not a fresh roll, it is an *edit of the composed `_base/<gender>-sheet.png`*, so the head,
material, lighting, crop and framing are carried over from an image that was approved once and is
the same image for both models. Only the hair rendering is left to differ. That is one variable
rather than six, and it was judged small enough to accept against re-shooting 46 renders.

What the extra four cents buys is prompt adherence, which is the concrete defect: nano-banana
returns sheets with a bald quadrant, and the sheet prompt carries a whole paragraph shouting that
all four heads must be wearing the hairstyle. Paying it up front is now the only defence, since
nothing re-rolls a bad sheet on its own — `--check` names them and a `--force` re-run is a
deliberate spend. If a batch ever does
come back visibly unlike its neighbours, the fix is to re-shoot *that batch*, not to revert the
constant and leave the catalog split three ways.

`--model` is untouched and still `fal-ai/nano-banana`. It is the text-to-image model, so it runs
only for `--no-edit` and for a base head with no reference on disk — neither is part of a catalog
batch, and the base heads are approved images nothing should re-roll.

**`scripts/try-on.mjs` sends the app's generation again, not just the app's prompt.** Its
justification is that a script testing what the app sends must send what the app sends — hence
importing `tryOnPrompt.ts` rather than copying it — and for as long as the app ran gpt-image-2 at
2.5x the price that held for the wording and not for the run: a prompt-writing loop goes dozens of
runs deep, so the script stayed on the cheaper model and every finished prompt had to be
re-confirmed against the app's. With both on nano-banana-2 that gap is closed. `--model` is still
there for measuring one model against another, and the model is still in the default output
filename so two runs do not overwrite each other.

`--no-reference` is the knob for the question the reference itself answers: it sends the photo
alone and lets the cut arrive as its name and description, which is `tryOnPrompt`'s existing
fallback for a style with no render. Described rather than shown, a cut is whatever the model
already thinks that name means and a different one each run — that is the thing being measured, and
`REFERENCE_VIEWS` stays at one either way.

**The launcher icon is cut from the artwork, not hand-exported.** `assets/Luvo-icon.png` is
the only icon file anyone edits; `npm run icons` (`scripts/generate-app-icons.mjs`) derives all
five files the platforms load — `icon.png`, `splash-icon.png`, `favicon.png` and the two Android
adaptive layers — and `app.json` points at those. It is free, needs no key, and takes about a
second, so re-run it rather than editing an output by hand.

The work it does is not resizing. The artwork arrives as an icon *mockup*: a rounded near-black
tile floated on transparency inside a soft violet-and-pink glow, with a lot of padding around it,
and shipped unprocessed every platform would put its own corner mask over a shrunken tile inside a
halo. So the script finds the tile, crops it square, and replaces the ground — with the tile's own
black for iOS, which rounds the corners itself, and with transparency for the splash, the favicon
and Android. `android.adaptiveIcon.backgroundColor` is the measured `#0d0914` and is a fallback
nothing should see. `assets/android-icon-background.png` is gone: it was the Expo template's, and a
background layer under an opaque foreground is a file that can only ever be wrong.

Four things in there took a second attempt and are commented at the code:

- **Tile and ground are separated on alpha, never on luminance.** The previous artwork was a dark
  tile on a cream ground, where luminance was the only signal there was; this one is dark on dark
  and luminance cannot tell them apart at all. Alpha can, and cleanly: the ground is 0, the glow
  ramps to about 60, the tile lands flat at 252 with a two-pixel edge between. `squareCrop`
  rescales that so the glow falls to 0 and the tile's own anti-aliasing survives — a flat
  threshold keeps the first and destroys the second.
- **The subject is found by eroding, not by hue.** It used to be "light and warm", which found
  brass on black; the new figure is half pink and half violet, so warmth finds one head and loses
  the other. Luminance alone is no good either — the tile's rim highlight is as bright as the
  figure. What separates them is *width*: `subjectBounds` erodes the bright mask by four pixels,
  which the rim does not survive and the figure barely notices, then grows the box back by the
  same margin.
- **The ground is bled outwards from the nearest tile pixel rather than filled flat**, because the
  tile is lit and a flat black beside it reads as a patch — and the bleed now starts at two
  different depths. iOS keeps the tile's glowing rim, since iOS masks the corners at very nearly
  the radius the artwork was drawn at and the rim is the icon's own edge. Android's art layer
  bleeds from 70px *inside* the rim, because it is full-bleed under a mask the system picks, and a
  rim carried outwards draws the tile's outline inside the finished icon — a rounded square within
  a rounded square, which is the same defect as the one below reached from the other side. That
  depth is clamped against `subjectBounds` (`RIM_GUARD`): erode past the figure and the figure
  becomes the bleed's source, which at 90px grew a pink tail out of the bottom of the icon.
- **The Android foreground is full-bleed and opaque**, because padding the safe-zone-sized art
  with transparency over a flat `backgroundColor` drew a faint rounded square inside the icon.

The whole thing assumes the artwork's house style — a rounded tile carried on its own alpha, lit
at the rim, with a subject brighter than the tile and drawn in strokes much fatter than that rim.
`findTile` and `subjectBounds` are what break first if that changes, and the symptom is silent:
`icon.png` comes back as the whole padded mockup, or the Android layers come back centred on the
tile instead of on the figure. Look at the five outputs after any change to the artwork.

**Sharing is a referral loop, and the picture never comes back to us.** That is the one rule the
whole feature is arranged around, and it is the same promise `docs/preview-generation.md` makes
one step further along: the finished preview lives on the phone that generated it and nowhere
else. Branding it server-side with `sharp` would have taken an afternoon and would have undone
that, so it is not done. Four consequences, and `docs/sharing.md` has the rest:

- **The shared image is composed on the device**, by photographing a view
  (`src/components/ShareCard.tsx`, captured by `src/lib/shareImage.ts`). `expo-image-manipulator`
  cannot draw, so a view capture is the only compositor here. The card is laid out at 360 points
  and captured at 1080 pixels, which is what every social app resamples to, and it takes the
  **photograph's own aspect** — a fixed 4:5 frame would crop the top of a tall selfie's head,
  which is the haircut. The branding is one line over the gradient that was already making the
  bottom edge readable, and the size of it is the whole design: **the moment it is big enough to
  be embarrassing nobody posts it and the reach is zero.**
- **A share link names a hairstyle, not an image.** So the landing page's `og:image` — the picture
  a scraper renders into a chat card before any human sees it — is the catalog's own mannequin
  render of that cut, public and CDN-hosted and identical for everybody who shared it. Never a
  Luvo user's face. `check-shares.mjs` asserts no local file uri can reach that page.
- **The three named buttons are shortcuts into the OS share sheet, and the screen says so.**
  Neither platform lets managed Expo code target a specific app with an image: iOS has no
  targeting API at all, and Android's needs an intent with `setPackage` plus a `FileProvider`
  grant. The url schemes that look like a way round it are not one — `whatsapp://send?text=`
  carries text and no image. A row of buttons each opening the same sheet while *pretending* to
  be a direct hand-off is the fake social-sharing button the brief rules out; a row that says
  "your share sheet opens with the picture and caption ready" is the platform's real behaviour
  with a shorter path to it. `shareTo()` in `src/lib/shareTargets.ts` is the seam where a native
  intent module would give Android genuine targeting, and nothing above it would change.
  The caption is the part that differs per platform: iOS carries it with the image in one
  activity and reports which app took it, Android's `expo-sharing` sends the file alone so the
  caption goes to the clipboard, and web uses the real `wa.me` and Facebook sharer intents. One
  asymmetry falls out of that and is worth knowing when reading the funnel: on iOS
  `share_completed` means "an app took it", on Android it means "the sheet closed".
- **What is attributable is stated rather than assumed.** A link followed by an installed app is
  fully attributable and is the only source anything writes. The Android Play `referrer`
  parameter is carried through the landing page and *nothing reads it* — that needs a native
  module. An iOS install from the App Store is not attributable without a third-party SDK, full
  stop. Attribution is first-write-wins per device and a sharer opening their own link is refused
  outright, because counting it makes the funnel a measure of curiosity rather than of reach.

The two slow things — composing the card and minting the link — both start when the share screen
opens and are promises the buttons await, so a user who looks at their picture for two seconds
waits for nothing. **Neither failure stops a share**: no card sends the raw preview, no link
sends the caption without one, and both are recorded as `share_failed`. That is the same rule as
everywhere else here — a degraded outcome is reported, never disguised — and `shareSource()`
reports `api` or `local` in Settings beside the catalog's and the generator's.

**Screenshots are off, everywhere, for the whole app.** A hairstyle render is the product. A
screenshot of a style card or of a finished preview is that render extracted losslessly, and where
it goes is somebody else's image model, as the reference our own generator was going to charge for.
So the app asks the OS not to capture its window, once, at the root — `<ScreenCaptureGuard>` in
`app/_layout.tsx`, over `expo-screen-capture`. The mechanism and the full argument are in
`src/lib/screenCapture.ts`; four things decide any change to it:

- **The two platforms are not the same strength, and the copy may only claim what each one does.**
  Android sets `FLAG_SECURE`: the OS refuses the capture, recordings come back black, the recents
  card is blank, and it is enforced below the app. iOS has no API that refuses a screenshot, so the
  module parents the app's window into a secure `UITextField` layer — the shutter fires, a file
  lands in Photos, and it is **black**. Nothing of ours leaves either way, which is the point, but
  only one of them is a refusal.
- **A blank picture is explained rather than left looking like a bug.** That is the whole reason
  `<ScreenCaptureGuard>` renders anything: on iOS a user who screenshots gets a black image and no
  word from the system, which reads as the app having broken. One toast says it was deliberate and
  points at Share, which does work. Android never fires it — the OS puts up its own toast.
- **It re-arms only when it is not already armed.** The block is held for the life of the process.
  Toggling `FLAG_SECURE` recreates Android's window surface, so re-asking on every foreground would
  buy a black flash on every return to the app and fix nothing; the foreground pass runs only when
  the last attempt did not land, which is the case that can actually change underneath us.
- **It does not break sharing, and one line makes sure of it.** Composing the share card
  photographs a mounted view, and on iOS the library's default path is the same snapshot machinery
  the secure layer defeats. `captureShareCard` retries once with `useRenderInContext`, which
  rasterises the layer tree in process and is not subject to it. Android's path is `view.draw()`
  and was never affected. **If the card ever starts coming back blank on an iPhone, this is the
  line to read** — and note the retry is a retry rather than the default on purpose, since
  `renderInContext:` misses anything the GPU composites late.

What it does not stop is a second phone pointed at the screen, and nothing in software does.
`screenCaptureSource()` reports `blocked` or `unavailable` in the same shape as the catalog's and
the generator's, and Settings prints it — the native module is absent from Expo Go and on the web,
and a build that quietly does not block screenshots looks exactly like one that does.

**Generation costs a credit, and the credit is the server's to move.**
This is the phase-2 slice that turns previews from free into a product.
`docs/credits.md` is the whole argument; the decisions that shape any change to it are these.

*Two free per device, and "device" is not "installation".* The requirement is that a reinstall
must not hand out two more, and the two platforms reach it differently. iOS already did, by
accident of an earlier good decision: the device secret lives in `expo-secure-store`, which is the
Keychain, and Keychain items outlive the app that wrote them. Android did not — the Keystore is
cleared with the package — so Android additionally reports `ANDROID_ID` in `X-Install-Anchor` on
every request. The allowance hangs off `install_anchors`, a hold is taken against **every** anchor
a device has, and remaining is the **minimum** across them, so linking a fresh install to a known
anchor can only ever reduce what it is owed. Taking the maximum or the sum would hand out exactly
what the table exists to withhold. What defeats it — a factory reset, a restore-as-new, a second
phone — is written down rather than implied; the real answer is App Attest and Play Integrity,
which is still its own piece of work. It is deliberately **not** fingerprinting: no IP, no screen
metrics, nothing composed from them, because both stores forbid it and a probabilistic identifier
denies free generations to people who never had any.

*Reserve, then settle, and the settle is a state transition.* A generation is **held** at submit
and settled when the job goes terminal: `ready` turns the hold into a spend, `failed` and
`cancelled` give it back. Holding rather than deducting is what makes "cannot generate twice on
one credit" survive a crash. Refunding a failure is a product decision and a plain one — a model
that fails is not the user's mistake. The one deliberate exception is a preview generated,
notified and never collected inside the retention window: the work was done and made available,
so the credit stays spent, and that is one commented line in `worker.ts`.

*It is the one place in the service that opens a transaction.* Every other invariant here lives
in a single row — the photograph scrub is one `update` that moves the status and nulls the key
together. A credit cannot be: the balance is in another table. A data-modifying CTE would be one
statement and `pg-mem` cannot run one, which would make the credit path untestable; settling in a
second call leaves a window where a crash strands a credit in `held` forever. So the three
terminal transitions in `jobs.ts` wrap both statements, and `check-credits.mjs` points
`withTransaction` at its in-memory client so the atomic path is genuinely executed.
**`unsettledCharges()` is asserted empty after every branch, exactly as `unscrubbed()` is for the
photograph — if you add a status or a path out of `running`, that is the assertion to keep
passing.**

*Nothing can go negative, and the visible check is not the guard.* The balance moves by
compare-and-set, the same shape the queue claims rows with. `/v1/previews` also reads the balance
before creating a job and that read is explicitly **not** the enforcement — it exists so somebody
with no credits sees a paywall rather than a job that appears and is cancelled a second later. The
comment there says so, because a reader who mistook it for the guard would eventually simplify the
real one away.

*Signing in adopts the device; there is no session token.* `devices.user_id` is the column
`003_previews.sql` created on day one and left unread, with a comment predicting this exact
update. A second bearer token would live in the same keystore, travel the same channel and be
exactly as strong as the secret already there; what it adds is an expiry, a refresh flow and a
class of bug where the device is authenticated and the user is not. Signing out is the same update
with a null. Accounts are keyed on `(provider, subject)` and **never on email** — matching on
email would merge an Apple private-relay address with a Google account forwarding to the same
inbox, and would let anyone who can receive mail there take over the account.

*Apple is not optional on iOS.* Guideline 4.8 requires an equivalent private sign-in wherever a
third-party one is offered, so Google-only is a rejection rather than a preference. Email is the
third because somebody who uses neither should not lose credits they paid for. In-app account
deletion is likewise mandatory (5.1.1(v)) and is a real deletion; purchases and ledger rows
survive it as `on delete set null`, because a refund six weeks later has to reconcile against
something.

*Only the webhook grants a credit.* The app calls RevenueCat, RevenueCat validates the receipt
with the store, and RevenueCat posts to us. An app that credits itself when `purchase()` resolves
gives its credits to anyone willing to run a proxy. The cost is a race of a second or two, which
`awaitCredit()` waits through — and on timeout the paywall says the credits are on their way,
which is true, rather than showing an error for something that worked. Replays are caught twice,
by `event_id` and by `(store, store_transaction_id)`, because those are two different ways to
replay and only the second catches a re-sent historical event.

*We own the credits, the store owns the price.* `credit_products` maps a product id to a number of
generations and has **no price column**; the API never sends one. StoreKit and Play quote the
price, localised, and a second copy in our database is a number that eventually disagrees with the
till. Adding a pack is a row plus a store listing, not a release — the same argument the catalog
makes. **The 20-pack is not sold with a struck-through $19.99**: it never was that price, so
showing one would be a fictitious reference price (EU Omnibus, FTC) and reads as a trick. It is
sold as 75c a generation against a dollar, which is the same saving stated truthfully.

*The app never adjusts a balance locally.* No optimistic decrement on submit, no optimistic
increment on purchase. The number moves without this app being involved — another device, a
refund, a refunded failure — so a local copy drifts. `AccountContext` refreshes on mount, on
foreground, and when a job settles. Two states must not be conflated: `ready: false` is **not**
"no credits", so `canGenerate` is true while loading (a paywall that flashes on cold start lands
on people who have twenty), and a failed refresh keeps the previous answer rather than blanking to
zero.

**The Privacy Policy and the Terms of Use are written once, and the privacy policy is a
description of this repository.** `src/lib/legal.ts` is both documents as data; `app/legal/[doc].tsx`
renders them as screens and `server/src/legal.ts` renders the same words at `/privacy` and
`/terms`, which are the urls the two store listings need. The server's copy is cut by
`sync-shared.mjs` for the reason `tryOnPrompt.ts` is — authored prose cannot be a hand-written
mirror, because two copies of a privacy policy that have drifted apart are two different promises
about somebody's photograph — so **edit the app's file and never
`server/src/generated/legal.ts`**, and keep `legal.ts` import-free or the sync refuses it.
`docs/legal.md` has the design; three decisions govern any change:

- **Every factual sentence in the policy describes something the code actually does**, and the
  places to check are the ones the policy leans on: the photograph scrub in `check-previews.mjs`,
  the install anchor in `docs/credits.md`, the funnel in `docs/sharing.md`, and
  `server/migrations/` for every column that exists. A change that makes one of those sentences
  false has to edit `src/lib/legal.ts` **in the same commit** — adding a column about a person, a
  third-party service, an analytics SDK, or a path out of `running` that does not scrub.
- **They are screens, not links out.** The moment anybody reads a privacy policy is the moment
  they are deciding whether to hand over a photograph of their face, so it cannot depend on a
  network; a build with no `EXPO_PUBLIC_API_URL` has no public page to link to; and from the
  paywall a browser hand-off is a purchase abandoned. `<LegalLinks>` is the one sentence that
  links to both, on welcome, sign-in, the paywall (App Store guideline 3.1.2 requires it there)
  and Settings.
- **`OPERATOR` is the only thing in the file that is not about the software**, and every field of
  it — contact inbox, postal address, governing law — is **unset**. Each degrades to a sentence
  that is true and visibly incomplete rather than to a plausible placeholder, which is the point:
  an inbox that bounces turns "not set up yet" into "ignored you". None of them is optional at
  launch — both stores require a working support contact, GDPR and the CCPA require a route for
  exercising rights that is not "delete the app", a policy with no postal address does not answer
  an identity-of-the-controller request, and terms with no governing law are a contract whose
  disputes go to whoever reaches a court first.

## Where the backend plugs in

`src/api/client.ts` is the only module that knows where the data comes from. The exported
signatures are the contract the screens depend on — keep them stable and nothing in `app/`
needs to change.

**The catalog is real, and it has three outcomes rather than two.** `fetchCatalog()` returns
`api` (fetched and cached), `cache` (the network failed, the device had a copy) or `bundled`
(no `EXPO_PUBLIC_API_URL`, or nothing cached to fall back to), and `catalogSource()` reports
which happened. That is not defensive plumbing; it is the same rule the rest of the app runs
on — a simulated preview is never labelled a real one — applied to data. Settings prints it,
and "offline copy" is shown as what it is rather than hidden, because a user looking at a
stale catalog deserves to know.

**Metadata is in Postgres, pixels are in R2, and nothing puts an image in a database column.**
The full argument, with the measurements, is `docs/catalog-architecture.md`. The three
decisions worth carrying in your head:

- **Object keys are content hashes**, served `immutable` for a year. Different pixels are a
  different URL, so there is no cache to invalidate, re-shooting a style is a new object plus a
  row update, and republishing an unchanged catalog uploads nothing. This is why the publish
  script is safe to run repeatedly.
- **Renders are WebP q80, masks are lossless WebP.** Measured over the whole catalog, 400.3 MB
  of PNG becomes 19.0 MB — a 21.1x reduction — at 21.4 KB per slot. The mask is lossless
  because a lossy stencil fringes exactly at the hairline, which is where the colour grade is
  judged. **Nothing is resized**: the sources are 512–720px against a `CARD_WIDTH` of about 501
  physical pixels on a 3x phone, so a thumbnail tier would soften every card to save 14 KB.
- **The render index is data at runtime, not code at build time.**
  `mannequinRenders.generated.ts` exists only because Metro can bundle an asset a module
  `require`s by a literal path. A URL has no such constraint, so
  `src/api/renderIndex.ts` installs the catalog's manifest and `mannequinRender()`,
  `mannequinMask()`, `mannequinViews()` and `renderedVariants()` read it with unchanged
  signatures. `RenderSource` is `number | { uri: string }` and every consumer already took
  both, which is why moving the catalog to a backend touched no screen.

**`assets/mannequins/` is still bundled, and that is transitional.** The generated module is
the fallback index, which is what keeps a fresh checkout runnable. It is also 400 MB in git and
in every build. Once the first real publish has happened, dropping the `require()` map — and
keeping the PNGs as generator sources outside the bundle — is a deletion rather than a design
decision, and belongs in its own commit.

**Adding or replacing a hairstyle is `npm run catalog:publish`, not a release.** That is the
sentence `project.md` asks for, and the publish script is the thing that makes it true: it
reads the authored catalog through the same `loadCatalog()` the mannequin generators use, so
`src/api/mockCatalog.ts` remains the *authoring* format even though the database is what the
app reads.

**The round trip is checked, and it is the check that matters here.** The risk in moving a
catalog behind an API is not that the server falls over — it is that a field quietly does not
survive the trip, and a hairstyle whose `variants` row comes back empty silently stops being
offered for any hair type on every phone. `server/scripts/check-roundtrip.mjs` runs the real
schema, the real publish writers and the real assembly code against an in-memory Postgres and
asserts that `/v1/catalog` returns field-for-field what `mockCatalog.ts` put in. It needs no
database and no credentials.

**`server/src/types.ts` and `server/src/hairstyles.ts` are deliberate mirrors** of
`src/api/types.ts` and the filtering in `src/api/client.ts`, for the same reason
`scripts/lib/variants.mjs` mirrors `src/lib/hairTypes.ts`: the app and the server are separate
programs and neither may import across the boundary. Both sides must agree, and the round-trip
check is what makes them.

**Sharing has two outcomes, reported the same way.** `shareSource()` returns `api` (the backend
minted a real, countable referral link) or `local` (no API, so the caption carries
`EXPO_PUBLIC_SHARE_URL` or nothing). The share itself always works — the image and the caption are
composed on the phone — but only a minted link can be followed back and counted, which is the
half the feature exists for, so Settings says which happened. `src/api/share.ts` is the only
module that knows.

**Generation has three outcomes, in the same shape as the catalog's three.** `generationSource()`
returns `server` (a job on the API — the one that ships), `direct` (no API url but a fal key in
the bundle: real previews generated from the phone, lost if the app is closed) or `simulated`
(neither, or the sample photo, which has no pixels behind it). `GenerationProvider` submits to
the backend on the first and calls `generateLook` on the other two; `generateLook` itself is now
the fallback pair rather than the whole story. Which one ran is recorded on the look as
`simulated`, so the result screen and the settings notice describe what actually happened rather
than what the build usually does — a failed generation is reported as a failure with a reason on
the job tile, never quietly replaced by a simulation.

`GenerationProvider` is a *watcher* on the server path, not an owner. Jobs with a `remoteId` are
persisted to AsyncStorage, reconciled against `GET /v1/previews` on launch and on every return to
the foreground, and polled while the app is in front of somebody. Its public surface — `jobs`,
`start`, `cancel`, `retry`, `notification` — did not change, which is why no screen did. The
waiting screen's honesty rule survives intact: the server reports which of three stages a job is
in and nothing about how far through it is, the client eases between reports exactly as it did,
and while a job is *queued* the countdown is suppressed in favour of its real position in the
queue — an estimate there would be the one thing that screen is written never to do.

`<Mannequin>` shows, in order: `hairstyle.imageUrl` (the backend, once it serves one), the
generated render for that style/gender/angle, then the procedural drawing from the `shape`
descriptor (`src/lib/hairShape.ts`) as the fallback. Whichever it lands on, the hair is recoloured
to the session's shade — the render through a masked `feColorMatrix`, the drawing by being painted
in it.

The middle step comes from the active render index — the catalog's when the app has an API,
the bundled module otherwise — and the generator keeps the bundled one in step automatically.
`scripts/generate-mannequins.mjs` writes PNGs to
`assets/mannequins/<style>/<variant>/<gender>-<angle>.png` — the variant directory is the matrix
on disk — and then rewrites
`src/api/mannequinRenders.generated.ts` — one `require()` per file, rebuilt from the whole
directory, after every finished style. Metro fast-refreshes on it, so a style generated while
the app is running appears in it, and styles generated earlier stay. `npm run mannequins:sync`
does the same scan on its own (it also runs on `npm start`) for renders that arrive any other
way. Only exact gender/angle matches are used, and everything with no render yet keeps the
drawing, so a half-generated catalog is a mix rather than a wrong image. Nothing in `app/`
knows about any of it: pass `styleId` and `variants` to `<Mannequin>` and the lookup happens in
`src/lib/mannequinRender.ts` (`mannequinRender` for the image, `mannequinMask` for its hair
mask). The variant is resolved once by `renderVariant()` and the mask is then taken from that same
variant, so a graded copy is never masked by the mask of a different shot of the cut.

**Render directories are created empty, ahead of time, and that is load-bearing.** `npm start`
and the top of every generator run call `ensureRenderDirs()`, which makes every
`<style>/<variant>/` and `<style>/<variant>/<length>/` the catalog's own `variants` and `lengths`
rows imply — 124 of them were empty on the day it was added. It looks like tidiness and is not.
Metro's `NativeWatcher` is `platform() === 'darwin'`, so on Windows and Linux the bundler runs
`FallbackWatcher`: one non-recursive `fs.watch` per directory, recursion by hand. When a directory
appears, the watcher walks it to start watching it *and* to register the files in it **at that
instant**; a file created in the gap between the walk and the watch is never registered and no
later event fires for it. It is invisible to the bundler until the next full crawl — until the dev
server restarts.

`--lengths` was the only thing that hit this, because it is the only thing that creates
directories mid-session: `short/` and `long/`, filled with four panels each within milliseconds.
The early angles win the race, the late ones lose it, and then `writeRenderModule` emits a
`require()` for all four because on disk all four are genuinely there — a bundling failure naming
a file you can see in the folder, always a late angle and never `front`. A directory that already
existed when Metro crawled is watched, and files landing inside a watched directory are picked up
reliably, so the fix is that no render directory is ever born while the server is up. Empty
directories are free: git does not track them, and every `existsSync` in the generator tests a
file rather than its directory, so an empty `short/` is never mistaken for work already done.
If a render ever goes missing from the bundle again, this is the first thing to check — and the
one-off cure is still to restart the dev server, which forces the crawl.

**Generation goes one hair type at a time.** `--hair-type <t>` narrows a run to a batch, and it is
read as a *hair type* rather than as a directory name: `--hair-type coily` means "everything a
type 4 user would be shown", so a cut whose coily version is the same render as its curly one
resolves to `curly` and is skipped as already generated. Matching directories instead would shoot
it twice and throw away the whole economy of the matrix.

The pre-matrix catalog was generated while `lib/prompts.mjs` carried a single
`HAIR_TYPE = 'Type 3A–3B curly'`, so every render already on disk is that style's curly shot and
sits in whichever variant its row points `curly` at. **Men → curly is complete** (25 of 26 styles;
`crew-cut` was never generated). The next batch is men → coily.
