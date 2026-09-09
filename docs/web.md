# Louvo on the web

A second front end onto the backend the phone app already uses. `web/` is a
Next.js app; nothing on the server changed to support it.

```bash
npm run sandbox     # the whole backend in memory, on :8099
npm run web:dev     # the site on :3000, pointed at it
```

---

## Why this exists

The decision is a distribution one rather than a technical one. An app store
release is a submission, a review queue and a version users have to install; a
web release is a deploy. For finding out whether anybody wants this — which is
the actual open question — the web wins on all three of the things that matter:

- **It can be found.** Fifty-six named haircuts on indexable pages is fifty-six
  entry points. A binary has one listing.
- **It can be linked to.** A share link that opens the haircut is worth more
  than one that opens a store page asking for an install first.
- **It can be changed on a Tuesday.** Prices, copy and layout are a deploy.

Payments follow the same logic: Stripe on the web takes ~3% where the stores
take 15–30%, and the margin table in `docs/credits.md` is computed against the
store rates. Sign-in is built and is a mailed six-digit code; Stripe is built and
is a hosted checkout. See *Sign-in* and *Payments* below.

---

## Why not `expo export --platform web`

The app already builds for web. Running that build would have been an afternoon.
What it produces is a phone in a browser window: one column, a tab bar, no URLs
worth sharing, no server rendering, and every screen laid out against a 390px
viewport.

That is a demo, and it fails at exactly the three things above. `/styles/blunt-bob`
has to return real metadata with the cut's own render as its `og:image` before a
shared link is worth anything, and a client-only Expo bundle cannot.

There is a second reason, and it is the one that decided the visual design.
**The app and the site are not addressed to the same moment.** The app is a tool
somebody opens in a queue at a barber's — it follows the phone's light/dark
setting because it is being used, not looked at. The site is a shopfront: opened
once, deliberately, often on a large screen, with about four seconds to say what
kind of thing Louvo is. So it commits to one dark look, sets its display type in a
serif, and puts the white studio plates on near-black where they read as lit
objects rather than as pictures on a page.

---

## What is shared and how

Four programs now read the same catalogue: the app, the server, the generators
and the site. The repository's existing rule decides how each boundary is
crossed — a *predicate* may be mirrored by hand and kept honest by running both
copies; a *document* may not, because two copies of a privacy policy that have
drifted apart are two different promises about somebody's photograph.

`web/scripts/sync-contract.mjs` applies that rule. It copies three files into
`web/lib/contract/`, re-pointing only their import headers, and `--check` runs in
`typecheck` and `prebuild` so a stale copy fails rather than ships.

| Source | Output | Why copied rather than mirrored |
| --- | --- | --- |
| `server/src/types.ts` | `catalog.ts` | The wire shape of `/v1/catalog`. A hand-typed fourth copy is a field that silently stops arriving — `Hairstyle.variants` coming back empty removes a cut from every hair type on every device |
| `src/lib/legal.ts` | `legal.ts` | Authored prose, for the reason `server/scripts/sync-shared.mjs` gives |
| `src/lib/hairShape.ts` | `hairShape.ts` | Pure geometry returning SVG path data. A second implementation would be a second silhouette for one haircut |

`web/lib/hairTypes.ts` is the deliberate exception: the hairstyle × hair type
predicates, mirrored by hand, because they have to compile against the web's own
types and because two implementations of "is this cut offered for type 4" *can*
be compared by running them.

**Edit the source, never the output.**

---

## Nothing new on the server

Every route the site calls already existed. Verified end to end against the
sandbox, including the browser's CORS preflights:

| What | Route |
| --- | --- |
| Catalogue | `GET /v1/catalog` — one document, fetched once per session |
| Balance | `GET /v1/account`, `GET /v1/credits` |
| Generation | `POST /v1/previews` → `PUT` to the bucket → `POST /:id/ready` |
| Watching | `GET /v1/previews/:id`, polled every 2s |
| Collecting | `POST /v1/previews/:id/collected` — called **after** the download |
| Sharing | `POST /v1/shares`, `POST /v1/events` |

Two deployment facts follow, and both are easy to miss:

- **The preview bucket needs this origin in its CORS policy.** The photo upload
  is the one request that leaves our origin. A bucket with no policy answers the
  preflight `403 CORS not configured`, which a browser reports to JavaScript as
  a bare `TypeError` with no status — after which the job sits in
  `awaiting_upload` looking exactly like a slow queue.
  `node server/scripts/preview-cors.mjs https://your-web-origin`.
- **`SHARE_BASE_URL` should point at the site**, not at the API host, or minted
  links open the app's install landing page instead of a hairstyle.

### The device secret is weaker in a browser, and it says so

`Authorization: Device <secret>` works unchanged: 32 random bytes minted on first
use. The honest difference is where they live. On a phone that is the platform
keystore, which on iOS outlives a reinstall — the accident of an earlier good
decision that makes the free allowance survive one. In a browser it is
`localStorage`, which a private window does not have.

So **two free previews are weaker on the web**, and that is a deliberate trade
rather than an oversight. The alternative is fingerprinting — IP, canvas, screen
metrics — which the mobile design explicitly refuses, which both stores forbid,
and which denies free generations to people who never had any. A demand test does
not need to be theft-proof. The real answer, when there is money on the line, is
an account *before* the free allowance rather than after, which is a Clerk change
and not a client one.

No install anchor is sent: `X-Install-Anchor` is Android's answer to a cleared
keystore and there is no browser equivalent that is not fingerprinting. The
server already treats an absent anchor as the device's own id.

---

## Decisions that shape the interface

**The home page is the try-on, and there is no landing page in front of it.**
What was here first was a hero, three explanatory sections, a privacy essay and a
closing call to action, with the product one click away behind a button — the
shape borrowed from software that has to convince somebody before it can show
them anything. Louvo does not have to: the whole proposition is a forty-second
demonstration and a visitor is one photograph away from it. So `/` **is** the
flow (`components/home/TryOnFlow.tsx`), and `/how-it-works` and `/pricing` are
deleted, with permanent redirects in `next.config.ts` because both were in the
sitemap. The one explanation worth keeping — what happens to your photograph —
is on the upload box itself, which is where the decision is actually made rather
than a page somebody would have to go and look for.

**The hero is a real before and after, and it is the only evidence on the page.**
The objection that stops somebody is *this will not look like me* — not "how does
it work" — and no paragraph answers it. So the right-hand column is a face wiped
between the photograph and the preview.

**It plays by itself, and that reverses a decision this document argued for
twice.** The frame was built to move only when pushed — first by a drag, then by
the cursor — on the argument that a comparison the visitor performs is evidence
and a comparison performed *at* them is an advertisement. That argument was not
wrong; the assumption under it was. Both versions bet that somebody four seconds
into a page will work out that a picture is interactive and choose to test it,
and most people do not. A hero that has to be discovered is a hero that is mostly
missed, and evidence nobody looks at loses to an advertisement everybody sees. So
the seam sweeps on its own and the set rotates through its faces, and a visitor
who touches nothing still sees every one of them — four faces, twenty-five
seconds — without touching anything.

That total is the one number to watch as the set grows. The cycle is paced for
legibility rather than for the total, so each face added is another 4.3 seconds
before the set comes round, and past five or six the last faces are being shown
to nobody. If the set has to get bigger than that, shorten the cycle rather than
letting the rotation grow unbounded — or accept that the tail is decoration.

The concession that keeps it from being a screensaver is that **it is paced to be
read**. One face is a 4.3-second cycle: 0.95s parked on the photograph, a 1.3s
reveal, then **1.15s holding the finished cut — the longest still moment in the
cycle, because the hold is the payoff** — and a quicker 0.9s back, since nobody
needs to study the original twice. A seam oscillating continuously would say
nothing.

These four numbers were 1.5 / 1.9 / 1.5 / 1.4 and were cut by about a third,
because a four-face set at the old pace took twenty-five seconds to come round
and most visitors never reached the fourth. The **shape** is what has to survive
a re-tune, not the values: park short, reveal, hold longest on the finished cut,
return quickest. Any change also has to keep `CROSSFADE` inside `PARK_BEFORE` —
the face swap is invisible only because the seam is parked over the photograph
while it runs.

**The pointer takes over the moment it is over the picture, and the loop stops
dead.** The insult was never autoplay; it is autoplay that ignores you. Leaving
hands the loop back without a jump: `phaseNearest` re-enters the timeline at the
phase whose position is closest to wherever the seam was left, so it continues
from the visitor's hand instead of snapping to whatever the clock reached while
they held it. A finger does the same on release — a touch has to be a drag,
because there is no hovering — which is why `pointerType` is consulted rather
than assumed. Both the loop and the cursor are smoothed by the same 70ms time
constant, which is why the handover between them is invisible, and it is a time
constant rather than a fraction per frame so a 120Hz display glides at the rate a
60Hz one does.

**Choosing a face pins the set**, because a choice outranks a demonstration —
the rule `<HairTypeChoice>` follows in the app. The sweep carries on, since the
sweep *is* the evidence and freezing it would leave a still photograph behind as
the reward for having pressed something.

**Reduced motion switches all of it off** — no sweep, no rotation, the seam at
rest and moving only for a pointer. This is decorative motion by any honest
reading, and the whole of it is what gets withdrawn. An `IntersectionObserver`
stops the loop when the hero is scrolled past, rather than spending a visitor's
battery animating a picture that is not on screen.

**The seam is driven through refs, not state.** A pointer sweep fires an event
per frame, and `useState` behind that is a React render of the whole hero — six
images, a thumbnail row, two labels — to move one edge. The animation frame
writes `clipPath`, `left` and `opacity` onto nodes held by ref; the only state is
which pair is showing, and the rest position is plain inline style so the server
renders the frame at rest with nothing to correct on hydration. Under
`prefers-reduced-motion` the ease is dropped entirely and the seam simply is
where the pointer is — still responsive, since it is only the glide that is
motion nobody asked for. `HeroCompare` is deliberately *not*
`<BeforeAfter>`; that one is the result page's, sized `w-fit` around an
`object-contain` image so a portrait preview does not arrive scrolled off its own
page, and a hero needs a fixed frame that fills its column. Do not merge them.

**It is a set of pairs, not one pair, and that follows from the same argument.**
A before and after answers *will this look like me* for exactly one person, and
the visitor is not that person: one woman with long straight hair is evidence
about long straight hair, and somebody with a type 4 coil reads the same picture
as a promise made to a stranger. So the frame takes a list — other faces, other
textures, both genders — with a row of thumbnails under it, and the visitor finds
the one nearest themselves. It is still one wipe at a time; three frames side by
side is a contact sheet, which is what the fallback already is and the weaker of
the two heroes. The set does not cycle on a timer either, for the same reason the
wipe does not slide on its own.

The pairs are files in `public/hero/`, found by `app/page.tsx` reading the
directory during the static render — so dropping them in is the whole job, and a
checkout without them falls back to three catalogue plates rather than to broken
images. They are joined on whatever follows the prefix (`before-1`/`after-1`,
`before-locs`/`after-locs`), sorted by filename, and a file with no partner is
dropped rather than wiped against somebody else's face.
`public/hero/README.md` is the brief: same face, same crop, an obviously
different cut, a real preview rather than a mock-up, coverage of both genders and
the four textures across the set, and written permission, since these are
photographs of people on a commercial front page.

**The frame is a drag target the size of half a phone screen, so it says
`touch-action: pan-y`** — on the figure *and* on the invisible range input, which
is the element a thumb actually lands on and which would otherwise swallow a
vertical swipe to set its own value. Without both, the front page cannot be
scrolled past on a phone. `pointercancel` is listened for alongside `pointerup`
for the other half of that: a swipe the browser turns into a scroll cancels our
pointer rather than ending it, and the frame would be left dragging with nothing
held down.

**The catalogue strip moves, and it carries the whole shelf.** Under the hero sit
two rows of real renders, and they used to be twelve stationary plates — six men's
and six women's, picked by popularity. Twelve is not a catalogue; it is a sample
of one. The question this section answers is *is my haircut in there*, and a
sample answers it for the twelve people whose cut is in it while everybody else
reads the same row as *no*. So each shelf now holds **everything the catalogue
has shot for that gender** — thirty-six cuts and thirty-nine — and drifts, which
is the only way a row a laptop wide shows forty of anything.

Four things about it are the design rather than the implementation:

- **The two rows run in opposite directions**, women left to right and men right
  to left. Two rails moving the same way read as one long escalator and the eye
  picks a lane; contra-motion reads as two shelves, and keeps each legible as its
  own answer. The speed is the same for both — the duration is
  `SECONDS_PER_PLATE` times the number of plates, so the longer shelf drifts at
  the rate of the shorter one instead of racing it.
- **It stops under the pointer**, and while anything inside it holds focus. Every
  plate is a link, and a link that moves out from under the cursor is a link
  nobody can follow. That is the hero's rule one section down: a demonstration
  yields the instant somebody reaches for it.
- **Every plate cycles through the textures its cut was actually shot in**, on
  `useVariantCycle` — the same shared beat the catalogue grid uses, so the shelf
  changes together rather than fanning into noise — captioned with the types that
  render stands for. This is deliberately **not** narrowed by a declared hair
  type, which is an exception to the rule governing every *choosing* surface on
  the site. That rule is about not putting a wrong image in front of somebody who
  is picking; this strip is the hero's set-of-faces argument applied to the
  catalogue, where one texture answers "will this work on my hair" for one person
  and a rail of straight plates reads to somebody with a type 4 coil as a promise
  made to a stranger. The caption is what keeps it honest — the plate says which
  types it is, so it never claims to be a texture it is not. `<StyleChooser>` and
  `/styles` still narrow strictly.
- **Reduced motion gets a still, scrollable row**, not a paused one. A paused
  marquee is a rail nobody can reach the end of, so it becomes what it was before
  it moved: one copy of the shelf, scrolled by hand.

The loop itself is two copies of the shelf in a track that travels half its own
width, which lands the second copy exactly where the first started — no
measurement, no resize observer, and nothing to break when an image or a font
changes a width. That exactness is also why the plates carry their gap as a
trailing margin instead of the track carrying `gap`: with `gap` the track is `2n`
items and `2n - 1` gaps, and half of that is not one copy. The second copy is
`aria-hidden` with its links out of the tab order — it is the same shelf a few
seconds later, and a screen reader should hear the catalogue once.

Two rules from the old strip survive intact. The shelves **never draw the same
photograph twice**: the dedupe is on the render's own url, so a unisex cut with
one shot appears on the shelf that reaches it first and is illustrated on the
other, which fixes itself as the missing renders are published. And renders sort
ahead of illustrations, with `ILLUSTRATED_FLOOR` as a floor rather than a cap: a
well-published shelf shows only photographs, and one that has barely been shot
falls back to the procedural drawings rather than to an empty rail. A marquee of
line drawings would be the wrong evidence under a line that says "every one shot
the same way".

**Three states, derived rather than stepped.** A photograph; then two questions;
then the catalogue, already narrowed. There is no wizard index and no route per
step: the state is read off what the session holds, and every earlier answer
stays one chip away.

**The questions are asked on every upload, not once per visitor.** Both are about
the person in the *picture* rather than the person at the keyboard, so a stored
answer is only good for the photograph it was given about — somebody trying a cut
on a friend, or coming back for a different face, would otherwise be silently
browsing the wrong catalogue with the controls a chip row away, which is exactly
where nobody looks while nothing appears to be wrong. `answeredFor` in
`TryOnFlow` holds the photograph the answers belong to.

**And nothing arrives pre-selected**, which follows from that rather than
contradicting it: if an answer belongs to a photograph, last visit's answer is a
fact about a different picture, and showing it lit is the screen guessing about a
face it has not seen. A lit tile is also the easiest thing to tap past without
reading, which is how somebody ends up browsing the wrong catalogue while
believing they chose it. The session still remembers — the chips after the
dialogue carry the answer and the catalogue is narrowed by it — but the dialogue
asks rather than proposes.

**The photograph comes first here and second in the app, and that is the same
argument reaching two answers.** The app asks gender and texture before the face
because its first run is somebody's introduction to the whole product
(`docs/onboarding.md`). A browser is entered sideways and the upload box is what
the visitor came for, so here the picture is the opening move and the two
questions follow it immediately — at the point they start to matter, which is the
point a grid has to be narrowed to be honest.

**The two questions are a dialogue.** `components/home/SetupDialog.tsx`. Once
answered they are furniture: a pair of control rows above the grid says "adjust
me", a dialogue that appears, takes two taps and leaves says "we needed to know".

**Neither question is illustrated with a catalogue render, and both were.**
*Gender* was two mannequin plates — the most popular men's cut beside the most
popular women's. But it asks *whose catalogue*, which is a category, and two
haircuts side by side invites comparing them **as haircuts**: the visitor reads
"do I want this crop or this lob" and answers a question nobody asked. It is two
the two gender signs now — Mars and Venus, blue and pink, the one symbol pair
that is read rather than interpreted — which also means the first question
renders without waiting on a fetch. The blue is `--color-azure`, added for this
control and for nothing else: two tiles in one violet would read as one thing
offered twice, which is the two-haircuts mistake made with colour.

*Hair type* was wrong rather than merely off. The tile picked the most popular
cut offered for each type and drew it in that type's texture — but the most
popular cut is usually the *same* cut for all four, so the row came back as one
haircut four times with a curl difference too small to see. The right image
already exists: `scripts/generate-hair-type-examples.mjs` makes one set per
gender in which the subject *is* the texture (the same plain hair on every panel,
so the pattern is the only variable), and the catalogue serves them as
`hairTypeExamples` — all four for a gender or none, enforced server-side, because
a photographed row above an icon row reads as a broken screen. **No set has been
generated yet**, so today the tiles fall back to the standard
straight/wavy/curly/coily diagram; run `npm run hair-types -- --gender male` and
`--gender female`, then publish, and the photographs take over with no change
here.

**There is no dead end in it.** Gender decides which renders exist, so it has no
skip. Hair type does, because *all types* is a real answer rather than a refusal
to give one, so it is one of the choices instead of an escape hatch.

**The chooser narrows the catalogue; it does not lock it.** It offered categories
and a search and nothing else, on the argument that gender and texture were
answered two questions ago and re-offering them would ask the same thing twice.
Half of that was right. Asking twice is not the failure — answering on somebody's
behalf and then hiding the switch is, and a visitor who wanted the women's shelf
or the coily one had to go back through a dialogue to find the control. So the
grid carries the same rail `/styles` does, **pre-set to the answers already
given** rather than empty: the difference between a filter and a question, which
is also why the dialogue in front of it is still worth having. `<CatalogFilters>`
is that rail, shared by both surfaces so neither can drift into offering
different controls over one catalogue; each page owns only the frame around it
— sticky and bled to the gutters on `/styles`, plain in the flow. The controls
write to the session, so a style page opened from the grid moves with them, and
the summary row above it no longer restates the two answers as chips.

**A card is a link, and generating happens on the style page.** It was a
*selection* first — tap a card, a bar slides up, generate from the grid — and
that was wrong for one concrete reason: **a haircut has a length**. A minority of
cuts are offered at two or three, and that control lives on the style page with
the four angles and the texture chooser, so generating off a grid card silently
sent the anchor length every time — a cut somebody could have had short going out
at its usual length with nothing on screen having mentioned it. The second reason
is nearly as good: the grid shows one three-quarter render, and *what does the
back look like* is a real question about a haircut.

So **Generate my preview** is `<TryOnAction>` in `StyleDetail`, after the length,
the angles and the texture — which is also where somebody arriving from a search
result or a shared link finds it. `app/styles/[id]/page.tsx` reads `?length=`
from its own search params rather than with `useSearchParams`: no hook, no
Suspense boundary, no second render.

**A missing photograph is taken there too, and that reversed the round trip.**
The action degraded to a link into the flow, which asked for the picture, raised
the two questions and then carried the cut and the length back so the visitor
landed on the style page again rather than on a grid. It worked, and it was still
the wrong shape. The dialogue earns its place in front of a *catalogue*: it
decides which renders exist, so a grid cannot be honest until it is answered.
In front of **one cut somebody is already looking at** it decides nothing they
have not decided — they found their haircut, which is the hard part — and three
screens of machinery to get back to where they were standing is a toll on the way
to the thing they came for.

So the button opens the file picker in place. `usePhotoIntake` is the shared
piece: the decode, the 1536px cap, the accepted types and the refusal wording
live there and nowhere else, for the same reason `<PhotoChooser>` has one
component behind its own two entry points — two surfaces that describe the upload
differently are two different promises about somebody's face. What is *not*
shared is the layout, because a drop box in the middle of a haircut's page would
be a second front door. The photograph lands in the session, the thumbnail
appears above the button, and the button becomes **Generate my preview** with the
length, the texture and the angle exactly as they were left.

**Gender is still asked, and it is the only one.** It decides which render
exists, so it cannot be defaulted — but it is two buttons in the action itself
rather than a navigation, and it is one tap. Hair type is not asked at all: *all
textures* is a real answer rather than a missing one, and the chooser for it is
already on the page. The line under the action that also sets gender ("Showing
every version of this cut — men's or women's?") is drawn only while there is no
photograph, so there are never two live controls for one answer six inches apart
— the same rule that took the answer chips off the home page's summary row.

`?style=` is not removed: `TryOnFlow` still reads it, because links minted before
this change exist. Nothing mints it any more.

**There is still no paywall in that flow.** The credit gate is where it always
was, on the action, and for a first visit it never fires. Somebody who has not
seen the product cannot value it — which is also why the packs moved to
`/account` rather than staying on a page of their own: a price shown before a
preview is a number with nothing attached to it.

**The plate is `#FFFFFF` and does not follow the scheme.** Every render is shot
on flat white; a dark ground under one draws a bright rectangle of the render's
own white with the seam on the render's edge, and a *tinted* plate leaves a
visible square in both schemes. Text drawn on a plate comes from
`--color-on-plate`, taken from the light palette.

**Violet is a colour something is; pink is only ever the far end of a gradient.**
Both measured off the launcher artwork. Pink dark enough to carry white text is
maroon and stops being the logo's pink.

**Waiting for content is a skeleton, never a spinner**, with one real exception —
`<Button loading>`, because an *action* in flight has no shape to stand in for.
A placeholder may state the layout and never the data.

**Cards cycle their variants on one shared beat.** Under *All Types* a card
cross-fades through every render the cut actually has, deduped by url so two
candidates resolving to one file do not read as a stutter. The clock is shared
because cards mount as they scroll into view, and equal delays measured from each
card's own mount fan apart within a screenful. It is slower here than in the app
(4.2s): a phone shows six cards, a laptop shows twenty-four, and the app's cadence
across that many plates stops reading as a page turning.

**Nothing on the generating page invents progress.** The server reports a stage,
not a percentage. The frame, the percentage and the clearing scrim are that
stage, eased; the countdown may only ratchet *earlier*, because the naive
estimate climbs whenever progress holds still; and while a job is queued the
estimate is replaced by its real queue position. The scissors are the other kind
of motion — deliberately untied to progress, because their job is to separate
"slow" from "hung". The stage word is gated on the job's real stage, one pool
per stage; *which* word it is, is pacing.

**And the bar is paced by the clock rather than by the poll**, which is a
correction rather than a refinement. Two bugs compounded into one symptom: the
bar reached 90% within a few seconds of a forty-five second generation and then
did not move again, which is precisely the frozen-bar failure the screen was
written to avoid.

- The poll effect was keyed on the job *object*. Every state change tore the
  interval down, re-ran it and fired an immediate `tick()` — and a poll sets
  state, so each poll scheduled the next one straight away. The loop ran as fast
  as the network answered instead of every two seconds, which is also a request
  storm nobody would have noticed from the outside.
- The bar advanced a fixed 35% of its remaining range *per report*. That makes
  how fast it moves a fact about the network rather than about the work: four
  fifths of a stage is spent in its first three reports however long the stage
  lasts.

`stageFill` replaces both. A stage spends 75% of its range at a steady rate over
however long that stage usually takes (`STAGE_NOMINAL_MS`), then decelerates
hyperbolically for ever without arriving. The steady half is what makes a wait
watchable — 20% to 72% over the model's nominal forty-five seconds, roughly a
point a second. The decelerating half is what keeps it honest: an overrun stays
visibly an overrun, still climbing by less and less, and it cannot reach the next
stage's floor because only the server can say that. A queued job holds outright:
nothing has been done to it, and its real position in the queue is on screen
beside it. `REDRAW_MS` is 250ms — the value is a function of the clock, so it can
be drawn as often as is useful without any of it becoming a claim.

**The result page is two columns, and what to try next is one of them.** The
preview on the left, the cut's own description and the suggestion rail on the right
— beside the picture from `lg`, rather than a scroll below it. Somebody looking
at a haircut on their own face is the most likely they will ever be to want a
second one, and a suggestion under the fold is a suggestion most people never
see. A phone has no "beside", so the same pieces interleave: the name above the
picture, the actions under it, and the suggestions — drifting — directly beneath
those. `CLAUDE.md` has the ordering and why the preview is
capped at `42svh` there.

The cards are seeded from the cut that was just generated (`relatedTo`, the
same nearest-neighbour scoring the style page uses, asked for
`SUGGESTION_COUNT`). The gender and hair type
come from **the look** rather than from the session, for the reason `TryOnFlow`
re-asks both on every upload: those answers are about the photograph, so a
session that has since moved on to a different face would narrow this row to the
wrong catalogue. They still sit *below* "About this cut" inside that column —
that heading names the cut in the picture, and other haircuts above it would
leave it pointing at whichever one the eye landed on last. A card is a link into
the style page, where the button that spends a credit already lives — and the
row itself is `<SuggestionShelf>`, the same component that draws *In the same
direction* under a cut, so the two places the site offers a next haircut are one
feature rather than two that look alike. Each page passes its own title and its
own frame; everything else — the heading, the "All cuts" link, the skeleton and
the rail, which drifts left to right at **every** width rather than only on a
phone — is the component's. It stopped being a grid from `sm` because four
stationary cards read as the four this page has rather than as the catalogue
they are drawn from, which is the argument the front page's shelves already
make. The line
under the heading says whether the photograph is still in the session, because
that is the difference between one tap and uploading again and the tab may have
been reloaded.

**The preview is shown; the comparison is offered.** The page opened on the wipe
at half, which meant the first sight of the thing a credit had just been spent on
was half of it, with an unchanged photograph filling the rest and a handle down
the middle of somebody's face. The comparison is the *second* question — the
first is "what do I look like", and only the whole picture answers it. So a
`Compare` toggle puts the photograph back underneath. It is the same
`<BeforeAfter>` in both states, handed `before={null}` when it is not comparing,
which is that component's own no-slider branch: swapping between two frames would
move the picture by whatever the two disagreed about.

**The primary action there is the next haircut, and it is an account.** The row
under the preview was Download, Share, Delete — three things to do with the
picture that already exists and nothing about the next one, which is the wrong
answer to the moment the whole two-column layout is arranged around. So while
this browser has never signed in, a solid *Keep trying hairstyles* sits above
that row and Download steps down to `secondary` beside Share for as long as it
is drawn: two solid buttons next to each other are two things asked for at once.
Nothing is removed — the picture is still downloadable, shareable and deletable
in the same row, one weight lighter.

It offers **more hairstyles, never one more generation**, which is the rule
`<SignInWall>` is written to and it is the same rule for the same reason: a
first sign-in carries `grantSignupBonus`, and naming that turns an account into
a transaction — an email for a preview — which is the shape of a trick even when
the offer is real, and is a promise about `SIGNUP_BONUS_CREDITS`, a server-side
constant no browser can read. The line under the button says only what is true
of the free allowance either way, which is that it hangs off this browser; at
zero it says that was the last one. It is deliberately not gated on an empty
balance: a visitor with a preview left is being offered more haircuts rather
than refused one, and the refusal, when it comes, is `<SignInWall>` on the
button that would have spent it. Two moments, one offer, the same words.

It is drawn only once `ready` is true, for the reason nothing else here reads a
balance early: `ready: false` is not "signed out", and a primary button that
appears and then turns out to have been about somebody who was signed in all
along is the page guessing. The door carries `?next=` like every other one, so
the visitor comes back to this preview — which is in this browser's IndexedDB
and is still there after the round trip.

**Both links out carry the answers the preview was generated with.**
`?gender=…&hairType=…` on the cut, on every suggestion and on "All cuts", so
a catalogue reached from a finished preview opens already narrowed to it. The
**length is not** in that set: gender and texture are facts about the person in
the photograph and travel to any cut, where a length is a fact about *one*
haircut and most of the catalogue is offered at only its anchor — so it is added
to the link to the generated cut alone, where it is true. `useAdoptedAnswers` in
`SessionContext` is what reads them back in, on the style page and on the
catalogue, once and only after the session has hydrated. The result page adopts
the look's own answers the same way: without it the four cards here are drawn
from the look and the page any of them opens is drawn from a session that may
have moved on, which is one texture on the card and another on the page.

**The laptop's picture column is the plate, and the plate is capped by the
window's height.** It was a square filling the whole column — 730px of one head
on a white ground at the site's own max width — and under it four angle tiles, a
rule and a heading, which put *In the same direction* below the fold on every
laptop. That is precisely where a suggestion goes unread, and the extra 300px of
picture bought nothing: `clamp(280px,38svh,440px)` still leaves the plate the
largest thing on the page by a wide margin.

Capping the picture alone is the failure worth recording. The column stayed
`1fr`, so a 730px track held a 340px plate and the page gained a 370px hole down
its middle with the plate aligned to nothing. So `--plate` is the **grid track**,
the block inside it is `w-full`, and `--measure` — the track, the gap and the
430px detail column — is the width of everything on the page, centred in the
window. The back link, both columns, the rule and the shelf then share one left
edge and there is no width left over to distribute. Both are custom properties on
`StyleDetail`'s own wrapper, which is what lets `StyleDetailSkeleton` inherit
them rather than keep a second copy of the same number. The phone's swipe deck is
unchanged at `36svh`.

**A style page has a way back at the top.** The only route back to the grid was
the "All cuts" link beside the related row, a scroll past the whole page away. It
is a link to `/styles` rather than the browser's own Back, because this page is
also where a search result and a shared link arrive and those have nothing behind
them; one destination serves both entry points, since the catalogue reads the
same session answers the flow's own chooser does. It is drawn in every state
including the error one — a page that could not reach the catalogue is exactly
when somebody wants to leave it.

**The client never adjusts a balance.** No optimistic decrement on submit and no
optimistic increment on purchase — submitting triggers a *re-read*. And
`ready: false` is not "no credits": `canGenerate` is true while loading, because
a paywall that flashes on a cold start lands on people who have twenty.

**An empty balance is two states, and the button raises two different
dialogues.** Signed in and out of previews is the packs (`<TopUpDialog>`). Never
signed in is `<SignInWall>` — *Sign in to preview more hairstyles* — and that is
not a softer paywall, it is the only one of the two that is not a dead end.
Credits live on an account, so `<Pricing>` already sends a signed-out Buy to
`/sign-in` carrying the pack: showing the packs first puts three prices in front
of somebody whose every next step is the page behind them. And a first sign-in
carries `grantSignupBonus`, so the visitor who does what the wall asks can
generate again without paying.

**Creating an account is the primary button and signing in sits beside it**,
which is the opposite weighting to the header's two doors. The header is asked by
anybody; the wall is raised at a browser that has spent its free previews and has
never signed in, which is overwhelmingly a first account rather than a forgotten
one. Without Clerk there is one door, named for both things it does — *Sign in or
create an account*, the wording `app/credits.tsx` already uses — because there is
no separate sign-up route to send anybody to.

**The wall never names the bonus**, and that is the decision in it rather than
the copy. *Sign in and get a free preview* turns an account into a transaction —
the shape of a trick even when the offer is real — and it is a promise about
`SIGNUP_BONUS_CREDITS`, a server-side constant this component cannot read and
must not guess at. Somebody who signs in and finds a preview waiting has been
treated well; somebody promised one has been sold something. The line under the
button matches: *No previews left · sign in to keep generating*, where a signed-in
visitor still gets *Generate opens the packs*.

Both dialogues are `<Dialog>` — one scroll lock, one Escape handler, one
reachable backdrop, one answer to what a card does when it is taller than the
phone it is on. The app reached the same split first and by a different road:
`app/credits.tsx` branches on `signedIn` and offers *Sign in or create an
account* in place of the packs, because there too a purchase needs an account.

**Every degraded outcome is reported.** The footer says whether the catalogue
came from the API or from this browser's offline copy; the packs on `/account` say
checkout is not open; the account page says sign-in is not built. Same rule as
`catalogSource()`, `generationSource()` and `shareSource()` in the app.

---

## The photograph, and the picture that is never shared

Unchanged from `docs/preview-generation.md`, because the mechanism is the same
one: the photo goes from the browser straight to a private bucket, is read once,
and is deleted in the same operation that ends the job.

What the client adds is the *collection*: the finished preview is downloaded into
this browser's IndexedDB and only then acknowledged, which is what deletes the
server's copy. Download first so nothing is lost, acknowledge second so nothing
is kept. IndexedDB rather than `localStorage` because a preview is a few hundred
kilobytes and base64 in a 5 MB quota fails on the third saved look — on the one
action the product exists for.

**A share link names a hairstyle, never an image.** What unfurls in somebody
else's chat is the catalogue's own mannequin render of that cut, public and
CDN-hosted and identical for everyone who shared it. `/s/[code]` resolves the
code and redirects to the style page; there is nothing in that route that knows
about a user's preview.

`robots.ts` disallows `/studio`, `/looks`, `/account` and `/s/`, and each of
those pages also carries `robots: { index: false }`. The duplication is
deliberate: the meta tag stops a fetched page being indexed, the robots file
stops the fetch.

---

## Verified

Against `npm run sandbox`, in Chrome:

- Every route returns 200; `sitemap.xml` carries all 56 hairstyles, built from
  the live catalogue.
- CORS preflights pass for `POST` and `DELETE`.
- The full lifecycle through the real UI: photo → prepare → submit → presigned
  `PUT` → `ready` → poll → download → save to IndexedDB → `collected` → result
  page → wipe → gallery. No console errors.
- The credit moved 2 → 1, server-side, and the header followed.
- `/styles` holds a steady 60fps with all 56 cards drawn as procedural
  mannequins (341 paths, ~206 KB of path data) — the worst case, since the
  sandbox publishes no renders.

Then re-run against the real backend (`npm run api`, revision 8: 56 hairstyles,
**all 56 with imagery**, 1180 render slots, every one with a mask). That is what
exercised the one path the sandbox cannot — the colour grade — and it found a
bug that only exists on the web.

### CSS `mask-image` is subject to CORS. SVG `<mask>` is not.

The grade was implemented the obvious way: a second `<img>` over the render
carrying `filter` and `mask-image`. Against the sandbox that is untestable, and
against the real CDN it fails — the catalogue bucket serves its objects public
and immutable with **no `Access-Control-Allow-Origin`**, and `mask-image`
fetches in CORS mode. The mask request is rejected, the masked element is
treated as fully masked out, and the grade silently disappears.

The symptom is the part worth remembering. Nothing looks broken: no missing
image, no error a user could see. What you get is a grid with **two hair colours
in it** — espresso for `any`/`straight`/`wavy`, black for `curly`/`coily` —
which is precisely the defect the grade exists to remove, reintroduced by a
fetch nobody watches fail. It was caught by reading a screenshot, not by a test.

The fix is client-side and needs no bucket change: the overlay is an inline
`<svg>` whose `<mask>` contains an `<image>`. SVG masks paint cross-origin
content without CORS, because nothing is ever read back. Measured side by side
against the live CDN — CSS mask: no grade; SVG mask: graded, with the mannequin
and the backdrop untouched.

Two consequences to keep:

- **`react-native-svg` has no such rule**, which is why the app's `<Mannequin>`
  does this with a plain masked layer and why this could never have shown up
  there. The two implementations differ for a real reason; do not "align" them.
- The overlay mounts only after the base `<img>` fires `load`. An SVG `<image>`
  has no `loading="lazy"`, so an eagerly mounted overlay pulls all 56 renders on
  first paint. Gating on the base image's load event gives the overlay the
  base's lazy behaviour for free.

Adding `Access-Control-Allow-Origin: *` to the catalogue bucket would also have
worked and was rejected: it makes correct rendering depend on a bucket setting
nobody would think to check, and the failure mode is invisible.

### Still unverified

**The rebuilt home flow.** The landing page was replaced by the try-on itself —
upload, then the two-question dialogue, then the narrowed catalogue — and the
studio console it supersedes is gone. It typechecks and builds, every route
answers, `/pricing`, `/how-it-works` and `/studio?style=…` redirect where they
should, and the hero's image detection was exercised both ways: files dropped
into `public/hero/` are served as `/hero/…`, and with them gone the page carries
no reference to that directory at all and falls back to plates. The pair matcher
that replaced it — several subjects, joined on the filename suffix, an unpartnered
file dropped — has been typechecked and reasoned about, not run against a real
directory.

What has **not** been done is walking it in a browser — there is no browser in
the environment it was built in. The dialogue and the chooser only appear once a
photograph has been chosen, so nothing past the upload box has been seen
rendered; the style page's body is client-rendered too, though its server half
was checked (real metadata, `?length=` accepted). Look first at: the wipe handle
on a touch screen, the two tile rows in the dialogue (they are catalogue renders,
so against the sandbox they are procedural drawings and against the real backend
they are plates), the scroll to the grid when the second question is answered,
and the whole round trip — style page with no photo → `/?style=…&length=…` →
upload → two questions → back to that style page with the length still set →
**Generate my preview**.

**A real generation.** The client's half — submit, presigned `PUT`, `ready`,
poll, download, `collected` — is proven against the sandbox, which does real
SigV4 presigning, and the preview bucket's CORS policy is already
`AllowedOrigin: *` for `PUT`/`GET`/`HEAD`. What has not been run from a browser
is the worker calling fal for real, which costs about five cents and needs
`npm run worker`. Nothing in that path is web-specific.

---

## Sign-in

Clerk's own card where there are keys for it, and a mailed six-digit code
against our own API where there are not — both on `/sign-in` and `/sign-up`,
built by `web/components/auth/AuthScreen.tsx`. Four things about it are
decisions rather than details.

**It is a page, and it used to be a dialogue.** The argument for the modal was
`<TopUpDialog>`'s and it was a real one: answering a two-field errand with a
navigation loses the cut, the length and the texture the visitor had set up.
What it cost was everything else. The most consequential form on the site sat in
a box a stray click dismissed, with no url to come back to, nothing to link to
from an email, and — once Clerk's own card was inside it — a second, differently
shaped surface floating over a page that was still visible behind it. It reads
as something that has interrupted you rather than as somewhere you have gone.

**`?next=` is what the modal was actually protecting, and it survives.** Every
door into sign-in carries the path it was pressed on — `useReturnPath` in
`components/AuthButtons.tsx` — and the visitor is put back on it: Clerk through
`fallbackRedirectUrl`, the mailed code through the "Back to it" button on its own
confirmation. The path is refused unless it starts with a single `/`, the same
rule `server/src/checkout.ts` applies to Stripe's return, because a destination
that arrives in a query string is attacker-controlled and `//evil.example` is a
perfectly good url that leaves the site.

**The photograph survives it too, and that was a bug worth its own module.** A
photograph *chosen but not yet submitted* is an object url — a handle the
**document** holds — so it died on any trip that came back as a fresh page load:
a Clerk round trip, and Stripe, which is a different origin entirely. Both are
entered from the generate button by somebody who has already picked their
picture, so the site was taking it away as the price of the errand it had just
sent them on, at the moment they had agreed to make an account.
`web/lib/pendingPhoto.ts` mirrors the bytes into IndexedDB while they are the
photograph on screen and `SessionContext` adopts them back on mount. It fills a
hole only — a picture chosen while that read is in flight wins — and it is one
record that mirrors the session, replaced when the photograph is replaced,
deleted when it is cleared, and expiring an hour after it was stored. That is a
weaker version of what a *saved look* already does with the same photograph in
the same database for ever. Uploading it early to survive the trip was the
alternative and was refused: the photograph reaches a bucket when there is a job
to consume it and is deleted when that job settles. `lib/idb.ts` now owns the
connection and the version, because two modules opening one database with two
version numbers is a `VersionError` waiting for whichever loads second.

**One column, centred.** There was a second beside the form — what Louvo is, in
three points — on the argument that a sign-in page is often the first page
somebody sees and a lone card says nothing about what is being signed into. It
is gone and the copy that goes there is still being decided; the page is the
form alone until there is something worth putting beside it. Whatever lands
there belongs in `AuthScreen`'s own column, never inside Clerk's card.

**Clerk draws its own card and we do not restyle it.** The card carries its own
title, subtitle and back link between steps, so there is no heading of ours above
it — and hiding Clerk's `header` element to remove the duplication would take the
back link on the verification step with it. `appearance` is set once on
`<ClerkProvider>`, in Louvo's palette; the page passes nothing but the two layout
boxes. `[[...sign-in]]` is an optional catch-all because the card is not one
screen: verification, factor two and the SSO tail are child paths under it.
`signInUrl`/`signUpUrl` are set on the provider rather than through
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, so a deployment cannot be configured into
disagreeing with the routes that exist in the build. `/account/profile` mounts
`<UserProfile />` the same way, for the same reason: one kind of surface for one
kind of errand.

**There is no separate sign-up without Clerk**, because the server has no
separate route. `upsertAccount` creates the account when the identity is new and
finds it when it is not, so one button covers both — and a first sign-in carries
`grantSignupBonus`, which is why the confirmation names the new balance instead
of navigating away. A credit that arrives silently is a credit nobody knows they
have.

Signing in **adopts this browser's device**: the server sets `devices.user_id`
on the device secret it already trusts, so `Authorization: Device <secret>`
stays the only credential a browser holds and there is nothing here to store,
refresh or expire. `signIn` and `signOut` in `AccountContext` set the state from
the server's own reply rather than adjusting the previous one, which is the same
rule that forbids an optimistic balance anywhere else on this site.

**Signing out is in the header**, under the account mark — `<AccountMenu>`,
which is the Clerk profile photograph where the identity came with one and the
initial where it did not. It was only on `/account`, which made leaving the one
errand on the site you had to navigate to do. Reaching `/sign-in` with a session
says so and offers the way back, rather than letting Clerk answer every attempt
with `session_exists`.

Two deployment facts. Without `RESEND_API_KEY` the route answers
`email_unconfigured` and the form reports it as this deployment's problem
rather than the visitor's. `EMAIL_DEV_ECHO=true` hands the code back in the
response instead — prefilled, and labelled on screen as a development setting —
and the server refuses to echo whenever a mail provider is configured, which is
what makes `npm run sandbox` a complete sign-in with no key at all.

---

## Payments

Stripe, and it is built. `docs/credits.md` is the design of the ledger it feeds;
this is the part that is specific to a browser.

**Checkout is hosted, and that decision removes most of the integration.** The
visitor leaves for Stripe's own page and comes back. So there is no card field,
no Stripe.js, no publishable key and no `NEXT_PUBLIC_STRIPE_*` anywhere in this
build — our PCI surface is SAQ A, and the only Stripe credentials in the system
are two secrets on the API. Stripe Elements would buy an in-page card form and
would cost all of that.

**There is no SDK on the server either.** What the service needs from Stripe is
four calls — create a session, read one back, read a Price, verify an HMAC — and
`server/src/stripe.ts` is those four plus a form encoder, in the same spirit as
the hand-rolled SigV4 in `storage.ts` and the JWKS verification in
`accounts.ts`. The judgement would flip the moment card data touched our code,
and it never does.

**The price is a Stripe Price and there is no copy of it here.**
`credit_products` gained one column, `stripe_price_id`, which is a *pointer*
rather than an amount; the API reads the Price when it lists the packs and sends
`price: { amount, currency }`, cached for a minute. `web/lib/pricing.ts` — the
indicative figures under a disabled button — is **deleted**, and
`web/lib/money.ts` is what replaced it: formatting, and not one number.
`scripts/stripe-setup.mjs` is what creates the Prices and writes the pointers,
and it is a script rather than a migration because test and live are two Stripe
accounts with two sets of Price ids behind one schema.

**Two paths grant a credit and they race on every purchase.** The webhook is the
authority; `POST /v1/checkout/confirm` exists because Stripe redirects the payer
back a second or two before the delivery lands, and showing somebody who has just
paid their old balance under a spinner is the worst possible moment to look
broken. The confirmation does not trust the browser — it reads the session from
Stripe itself — and both paths write a purchase row keyed on the PaymentIntent,
so whichever arrives second is caught by `purchases_transaction_idx` and grants
nothing. That index is load-bearing rather than defensive.

**The return goes to the page the purchase started from, and the browser sends a
path rather than a url.** `success_url` is a link the payer follows from Stripe's
own domain moments after typing card details, which is as trustworthy as a
phishing target ever gets, so the origin is the server's to decide and a
protocol-relative `//evil.example` is refused rather than sanitised.
`<CheckoutBanner>` is mounted in the root layout for the same reason: most
purchases begin in `<TopUpDialog>` over a haircut, so the receipt has to be able
to appear anywhere.

**Whether checkout is open is the server's answer.** `/v1/credits` reports
`checkout: true|false`, and `hasStripe` is gone from `lib/config.ts` — it read a
publishable key in *this* build to decide something about a key on the *API*,
which is the mistake a build with one and not the other would have shown as a
button that 503s. The state is reported, in the same shape `catalogSource()` is.

**The payer's address is prefilled and Stripe holds it read-only.** The checkout
page asked for an email that the account had already given us, which is a field
somebody has to retype at the one moment a form should be asking for as little as
possible — and a receipt that then goes to whatever was typed rather than to the
inbox the credits are held against. `customer_email` is read from `users` inside
the route rather than taken from the request, for the same reason
`client_reference_id` is: nothing the browser claims about who it is survives
that call. An account with no address on it — Apple with the email hidden, a
Clerk token carrying no claim — sends no field and Stripe asks, which is the
honest degradation rather than a guess.

### The payment history, and the invoice behind each row

`/account` lists what has been bought under the packs it can buy: a total spent,
the previews that total bought, and one row per completed checkout with its date,
its pack, its amount and a button. `<PurchaseHistory>` is the component and
`GET /v1/purchases` is the route.

**It is not the credit ledger, which was deliberately cut from this page.**
`<AccountPanel>` records that deletion and the argument still holds: "held, spent,
released, granted" is one row per movement of a credit, which is a support tool
and reads as a bank statement. A payment history is one row per *transaction*,
and it answers a question somebody actually arrives with — what have I paid you,
and can I have the paperwork.

**The total is the server's, and it is a list rather than a number.** `spent`
comes back per currency, because a euro and a dollar cannot be added without a
rate and a rate is a second price this codebase has spent two migrations
refusing to hold. Almost always one entry, drawn as one figure. A refunded
purchase stays in the list and is not counted: hiding a reversal leaves a history
nobody can reconcile, and counting it overstates what somebody paid us by exactly
what we gave back. `check-stripe.mjs` asserts both halves, because a total that
disagrees with the rows under it is a page that looks perfectly fine.

**The invoice is Stripe's document, fetched when it is asked for.**
`invoice_creation` is enabled on the Checkout Session, so Stripe issues a
numbered PDF — an invoice needs a sequence, a tax registration and an address,
none of which this service holds or should start holding to produce one.
`GET /v1/purchases/:id/invoice` reads the PaymentIntent, follows it to the
invoice and answers with a **url**: no bytes proxied through this process, and
nothing cached, because a stored `invoice_pdf` is a link that outlives what it
pointed at and is handed over at the exact moment somebody needs it to work.

Three consequences worth not re-deriving:

- **It is not retroactive.** A payment taken before invoicing was switched on has
  no invoice and never will, so the route falls back to the charge's hosted
  receipt and reports `kind: 'receipt'`. The row re-labels its own button, because
  a receipt drawn as an invoice is a small untruth told to somebody's accountant.
- **A purchase id is not a bearer token.** The lookup is `where id = $1 and
  user_id = $2`, and a purchase belonging to another account answers exactly as
  one that does not exist — the rule `/v1/checkout/confirm` already applies.
- **An app-store purchase has no button.** Its receipt is in the buyer's Apple or
  Google account and is not ours to hand over. The row carries
  `documented: false` so the interface never draws a control that is going to
  answer 409.

**There is no card on file to manage, and the page says so.** A credit pack is a
one-time payment with `setup_future_usage` unset, so no payment method is ever
attached to anything — there is nothing to update, nothing to remove, and no
subscription to cancel. A billing section that offered card management would be
offering to manage something that does not exist.

`server/scripts/check-stripe.mjs` is the test, and it runs in `npm run check`
with no key and no network: a forged, tampered, stale or unsigned delivery is
refused; a purchase replayed by event id and by payment intent grants once; the
credit count comes from `credit_products` and never from the session metadata;
and a refund clamps at zero. `npm run sandbox` serves a miniature Stripe from its
own process, so a complete purchase — including the signed webhook — can be
walked with no Stripe account at all — including the Invoice button, which the
sandbox answers with a stand-in invoice page that says on its face that it is
one.

---

## Not built

- **Favourites on an account.** Currently `localStorage`. They are the one piece
  of state here that should follow a person; saved looks should not.
- **`OPERATOR` is still unset** in `src/lib/legal.ts` — contact inbox, postal
  address, governing law. The site renders the same documents as the app, so it
  inherits the same blocker: none of the three is optional at launch.
