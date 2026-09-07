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
```

There is no linter configured. `npm run typecheck` is the check to run after changes to the
app; the server has its own (`npm --prefix server run typecheck`) plus its real tests,
`npm --prefix server run check` — the catalog round trip and the preview job lifecycle, both
described below. The root `tsconfig.json` excludes `server/`: the two programs have different
`lib`s (React Native versus Node) and typechecking one under the other's globals produces
failures that are not bugs.

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
