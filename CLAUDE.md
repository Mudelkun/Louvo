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

Still simulated: accounts, favourites and saved looks (device-local), and sharing.

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
npm run catalog:check         # sync check + catalog round trip + preview lifecycle — free
npm run catalog:publish:dry   # transcode + report; uploads nothing, writes nothing — free
npm run catalog:publish       # metadata into Postgres, imagery into R2
```

There is no linter configured. `npm run typecheck` is the check to run after changes to the
app; the server has its own (`npm --prefix server run typecheck`) plus its real tests,
`npm --prefix server run check` — the catalog round trip and the preview job lifecycle, both
described below. The root `tsconfig.json` excludes `server/`: the two programs have different
`lib`s (React Native versus Node) and typechecking one under the other's globals produces
failures that are not bugs.

Reference material: `project.md` (product spec) and `App-reference.png` (the original flow
mockup — treated as inspiration, not a spec; the implemented design departs from it).

## What Hairify is

A React Native / Expo mobile app for virtually trying hairstyles. The user flow: upload a photo → pick gender → pick hair type → browse the catalog → generate an AI preview of themselves with that style → compare before/after, save, share.

The user picks a haircut. The length and fade-level controls the spec originally called for are gone from the app: the cut is the product.

Hair type *is* a property of a hairstyle — see the matrix section below — and is generated.
Colour is not a property of a hairstyle and is not generated. Every mannequin — drawing and AI render alike — is produced in one shade (`BASE_HAIR_COLOR` in `src/lib/constants.ts`) and recoloured on screen by `src/lib/colorGrade.ts`. **There is no colour picker in the UI right now**, but the app is no longer at the identity grade: the session starts at `DEFAULT_HAIR_COLOR_ID` (jet), so every mannequin is graded to black and the two shades the catalog is shot in stop showing as two hair colours in one grid. The grade, the masks and the session's `colorId` are all live and working. Putting the choice back is a `<SwatchRow>` bound to `setColor` — the default is a starting value, not a lock — and the reason it is worth keeping intact is below.

## Planned stack

- **Mobile:** React Native with Expo (iOS + Android)
- **Backend:** Node.js API server, hosted on Railway (database also on Railway)
- **AI image generation:** Fal.ai — used both for the per-user hairstyle previews and for generating the catalog's mannequin images

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
  outlined slots, the selection in the app's active-filter brass rather than in the solid ink it
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

**The launcher icon is cut from the artwork, not hand-exported.** `assets/Hairify - icon.png` is
the only icon file anyone edits; `npm run icons` (`scripts/generate-app-icons.mjs`) derives all
five files the platforms load — `icon.png`, `splash-icon.png`, `favicon.png` and the two Android
adaptive layers — and `app.json` points at those. It is free, needs no key, and takes about a
second, so re-run it rather than editing an output by hand.

The work it does is not resizing. The artwork arrives as an icon *mockup*: the tile is
photographed with a drop shadow on a cream ground, and shipped unprocessed every platform would
put its own corner mask over a shrunken tile floating in a pale border. So the script finds the
tile, crops it square, and replaces the ground — with the tile's own black for iOS, which rounds
the corners itself, and with transparency for the splash, the favicon and Android. Two things in
there took a second attempt and are commented at the code: the ground is **bled outwards from the
nearest tile pixel rather than filled flat**, because the tile is lit and a flat black beside it
reads as a patch; and the Android foreground is **full-bleed and opaque**, because padding the
safe-zone-sized art with transparency over a flat `backgroundColor` drew a faint rounded square
inside the icon for exactly the same reason. `android.adaptiveIcon.backgroundColor` is now the
measured `#171716` and is a fallback nothing should see. `assets/android-icon-background.png` is
gone: it was the Expo template's, and a background layer under an opaque foreground is a file that
can only ever be wrong.

The whole thing assumes the artwork's house style — a dark tile on a light ground, subject in a
warm tone. `findTile` and `goldBounds` are what break first if that changes.

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
