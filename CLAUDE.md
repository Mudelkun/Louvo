# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 is built: a complete, navigable **frontend prototype**. No backend and no database —
the catalog and everything else that would hit a server is served from mock data behind a
simulated delay. **Preview generation is real**: with `EXPO_PUBLIC_FAL_KEY` set the app calls
Fal.ai directly, and without it falls back to the old simulation. See `README.md` for the
screen map and what is still simulated.

Commands (run from the repo root):

```bash
npm install
npm start          # Expo dev server (syncs the generated render + example maps first)
npm run ios / android / web
npm run typecheck  # tsc --noEmit
npm run mannequins -- --matrix   # the hairstyle x hair type matrix — free, no key
npm run hair-types -- --dry-run  # the hair-type picker's examples — free, no key
npm run try-on -- --photo me.jpg --style buzz-cut --dry-run   # one preview — free with --dry-run
```

There is no test setup and no linter configured yet. `npm run typecheck` is the check to run
after changes.

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

What the extra four cents buys is prompt adherence, which is the concrete defect: `--sheet-retries`
exists because nano-banana returns sheets with a bald quadrant, and the sheet prompt carries a
whole paragraph shouting that all four heads must be wearing the hairstyle. If a batch ever does
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

## Where the backend plugs in

`src/api/client.ts` is the only module that knows the data is mocked. It holds a `USE_MOCKS`
flag and a `TODO(backend)` at each call site. The exported signatures are the contract the
screens depend on — keep them stable and nothing in `app/` needs to change.

`generateLook` is the one call that is no longer mocked, and it is two paths behind one
signature: `generateTryOn` when there is a key and a real photo, the original stepped simulation
otherwise (the sample photo has no pixels behind it, only a sentinel that draws the procedural
mannequin). Which one ran is recorded on the look as `simulated`, so the result screen and the
settings notice describe what actually happened rather than what the build usually does — a
failed generation is reported as a failure with a reason on the job tile, never quietly replaced
by a simulation.

`<Mannequin>` shows, in order: `hairstyle.imageUrl` (the backend, once it serves one), the
generated render for that style/gender/angle, then the procedural drawing from the `shape`
descriptor (`src/lib/hairShape.ts`) as the fallback. Whichever it lands on, the hair is recoloured
to the session's shade — the render through a masked `feColorMatrix`, the drawing by being painted
in it.

The middle step is automatic. `scripts/generate-mannequins.mjs` writes PNGs to
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

**Generation goes one hair type at a time.** `--hair-type <t>` narrows a run to a batch, and it is
read as a *hair type* rather than as a directory name: `--hair-type coily` means "everything a
type 4 user would be shown", so a cut whose coily version is the same render as its curly one
resolves to `curly` and is skipped as already generated. Matching directories instead would shoot
it twice and throw away the whole economy of the matrix.

The pre-matrix catalog was generated while `lib/prompts.mjs` carried a single
`HAIR_TYPE = 'Type 3A–3B curly'`, so every render already on disk is that style's curly shot and
sits in whichever variant its row points `curly` at. **Men → curly is complete** (25 of 26 styles;
`crew-cut` was never generated). The next batch is men → coily.
