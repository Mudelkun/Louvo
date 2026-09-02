# Mannequin catalog generator

Generates the neutral mannequin imagery for every hairstyle in the catalog, with fal.ai.

```
scripts/
  generate-mannequins.mjs        CLI + orchestration
  sync-mannequin-renders.mjs     points the app at the PNGs on disk (free, no key)
  generate-hair-type-examples.mjs  the picker's four textures, per gender (its own pipeline)
  lib/catalog.mjs                loads the catalog (mockCatalog.ts today, the API later)
  lib/fal.mjs                    fal queue client — no SDK, no dependencies
  lib/prompts.mjs                catalog record -> prompt
  lib/sheet.mjs                  2x2 four-view sheet: compose, slice, bald-panel check
  lib/grid.mjs                   the crop maths and hair measurement both sheets share
  lib/hairTypeSheet.mjs          2x2 four-type sheet: slice, bald + sameness check
  lib/hairTypePrompts.mjs        hair type -> prompt (not a catalog record — see below)
  lib/hairTypeExamples.mjs       writes src/api/hairTypeExamples.generated.ts
  lib/png.mjs                    dependency-free PNG decode / crop / resize / encode
  lib/renders.mjs                writes src/api/mannequinRenders.generated.ts
  lib/variants.mjs               reads the hairstyle x hair type matrix out of the catalog
  reference-head.png             the approved look, cropped out of App-reference.png
  mannequin-overrides.json       optional per-style prompt nudges (not created by default)
```

## Setup

Put the key in `.env.local` at the repo root (`.env*.local` is already gitignored):

```
FAL_KEY=your-fal-key
```

Nothing to install — the script is plain Node 18+ with `fetch`, and reads the TypeScript
catalog through the `typescript` package that is already a devDependency.

## The hairstyle x hair type matrix

**Run this before any batch. It is free and needs no key.**

```bash
npm run mannequins -- --matrix                 # the whole catalog
npm run mannequins -- --matrix --gender male   # or one gender
```

```
hairstyle       straight wavy     curly    coily    renders  on disk
buzz-cut        any      any      any      any      1        1/1
crew-cut        straight straight curly    coily    3        0/3
textured-crop   straight wavy     curly    coily    4        1/4
afro            -        -        curly    coily    2        1/2
```

A cell is the render that hair type resolves to. Two types sharing a name share one image; `any`
is a cut too short, too set or too constructed for natural texture to read at all; a dash is a
style not offered for that type. That is **103 renders across the 36 styles instead of 144**, and
the saving is the whole point — generating four versions of a buzz cut buys nothing.

The classification lives in the catalog, one `variants` row per hairstyle
(`src/api/mockCatalog.ts`), because whether a curly textured crop needs its own shot is a
judgement about that haircut. `lib/variants.mjs` only reads those rows. A style with no row falls
back to a single `any` render and `--matrix` names it and exits non-zero.

### Generating a batch

`--hair-type` is read as a *hair type*, not as a directory name — `--hair-type coily` means
"everything a type 4 user would be shown", so a cut whose coily version is the same render as its
curly one resolves to `curly` and is skipped as already generated:

```bash
npm run mannequins -- --sheet --gender male --hair-type coily --dry-run   # 22 sheets, ~$0.88
npm run mannequins -- --sheet --gender male --hair-type coily
```

Everything already on disk was shot while `lib/prompts.mjs` carried one
`HAIR_TYPE = 'Type 3A-3B curly'` constant, so **men x curly is complete** (25 of 26 styles;
`crew-cut` was never generated) and lives under each style's curly — or `any` — directory.

Two things change between two shots of the same cut, and nothing else does: the `Hair type:` line
(`HAIR_TYPE_LABELS`) and the shade (`HAIR_COLOURS`), both in `lib/prompts.mjs`. The head, material,
light, crop and framing are identical by construction, because every shot is an edit of the same
base sheet.

The `Hair type:` line is deliberately the bare label — `Type 4A–4C coily`, no prose. The longer
descriptions in `HAIR_TYPES` exist for the hair-type picker's example sheet, which draws all four
textures in one image and has to be told how they differ; a catalog sheet draws one and needs no
such contrast. Keeping it bare is also what makes the coily batch the same prompt as the curly
catalog it has to sit beside.

`HAIR_COLOURS` is espresso for everything except **coily, which is shot in black** — espresso reads
as a muddy mid-brown on type 4 coils, which are mostly self-shadow with little lit surface to carry
a hue. Two shades means two grade anchors in the app: run `node scripts/measure-hair-tone.mjs`
after a batch and paste each mean it prints into the matching `BASE_HAIR_COLORS` entry in
`src/lib/constants.ts`. It reports per variant for exactly this reason.

## How it works

Every image is the **same head**, and only the hair changes. That is a spec requirement, not a
nicety: the catalog only reads as one catalog if 36 styles are modelled on one head.

So generation is two-stage:

1. **Base heads** — one bald, faceless mannequin per gender × angle (6 images), made by
   *editing* `reference-head.png` (cropped straight out of `App-reference.png`) down to a bald
   head. The material, lighting, crop and background are inherited from the mockup rather than
   described in words, which is the only reliable way to hit them. Delete or replace that file
   (`--reference`) and the script falls back to a text-only prompt.

   **`half` is the exception, and it is generated from `front` rather than from the reference.**
   `half` is the hero — the card image and the top of the style screen — and it used to be made by
   telling the model to keep the reference's pose. The reference is itself turned far enough that
   the face plane goes edge-on, so that produced a *rear* three-quarter and every style inherited
   it. It is now a small edit of the approved dead-on `front` head, turned 25-30 degrees, which is
   the only formulation that lands: describing the angle from scratch comes back at 50-60 degrees
   every time. So `front` must exist before `half`, and `ensureBaseHeads` orders them that way.
2. **Styles** — each hairstyle is an *edit* of the matching base head. The prompt tells the
   model to keep the head, material, lighting, crop and background and change only the hair.
   The reference is deliberately *not* passed here: the base head already carries the look, and
   sending the reference to every style risks bleeding its own haircut into the others.

Prompts are derived from catalog data, never hardcoded: the `shape` descriptor
(`top`/`sides`/`back`/`fringe`/`texture`/`part`/`knot`/`tail`), the style name and its
description. A style added to the database tomorrow gets a prompt with no code change. Colour is
not among them: every style is shot in the one `HAIR_COLOUR` in `lib/prompts.mjs`, because the
app grades that render to whichever shade the user picks (`src/lib/colorGrade.ts`). Hair type
*is* among them — a coily crop is a different silhouette, not a recolour of the curly one, and no
filter gets you from one to the other — but it comes from the variant being generated rather than
from `shape.texture`, as its own labelled line the model reads as a specification.

See `lib/prompts.mjs` — `HOUSE_STYLE` is the consistency contract and should stay identical for
every image.

## The approval workflow

**Step 1 — one finished mannequin.** Two images (the base head, then that head wearing one
haircut), so you are approving the thing the catalog will actually show:

```bash
npm run mannequins -- --style low-taper-fade --gender male --angle front --force   # ~$0.08
```

Compare `assets/mannequins/low-taper-fade/curly/male-front.png` against the hero shot in
`App-reference.png` — note that `_base/male-front.png` is the bald foundation, not the image the
app shows. The target is a matte white head and neck ending in the mannequin's wide flat display
base — a sculpted plate cut by the bottom of the frame, never a rounded bust and never real
shoulders — turned three-quarters so the taper, the ear and the nape all read, under high-key
light from the upper left on a white background, with a blank face and sculpted ears. The material values in `HOUSE_STYLE` are sampled from the reference
(highlight `#E9E8E6`, mid `#E2E1DE`, shadow `#D4D1CD`, background `#FFFFFF`); if a run drifts
warm or crops out to a bust, that block is what to tighten.

**Step 2 — the rest of the base heads and the other two angles.** Check that the head is
unchanged between front, side and back.

```bash
npm run mannequins -- --base-only                    # the remaining 5 base heads
npm run mannequins -- --style low-taper-fade --gender male
```

Open `assets/mannequins/index.html` in a browser — the contact sheet lays every generated image
out in a grid, which is how you actually judge consistency.

If it is wrong: adjust `lib/prompts.mjs` (or add a per-style nudge to
`scripts/mannequin-overrides.json`, `{ "low-taper-fade": "extra sentence" }`) and re-run with
`--force`. Existing files are otherwise skipped, so a plain re-run only fills gaps.

`--force` deliberately does **not** touch the base heads: they are the approved foundation and
every style image inherits them, so replacing them silently would move the whole catalog. Use
`--force-base` when you actually mean to change the foundation.

**Step 3 — a sample of the catalog**, to check the vocabulary holds across long, curly, tied-up
and shaved styles before committing to the whole run:

```bash
npm run mannequins -- --limit 6 --angle front
```

**Step 4 — everything.**

```bash
npm run mannequins -- --yes        # every variant of every style, plus the 6 heads
```

The run is resumable: each image is written and recorded as it lands, failures are reported at
the end, and re-running the same command retries only what is missing.

## Bald panels

In sheet mode the edit model does not reliably dress all four heads. Roughly one panel in eight
comes back untouched — three views wearing the haircut and a bald base head in the fourth
quadrant — and it is `front`, the flattest and least hair-revealing view, that gets skipped most
often. Nothing in the response says so; the sheet arrives looking like any other success.

So every sheet is measured before it is accepted. Each panel's hair coverage is the fraction of
its pixels darker than the mannequin's own shading, and a panel under **3%** is bald. That
threshold is measured, not guessed: across the first fifteen sheets, styled panels covered 9.5%
(a low taper fade seen dead-on, the least hair any catalog cut has shown) to 52% of their frame,
while every skipped panel came in between 0.1% and 0.7% — the mannequin's own shading and the
shadow under its jaw. Nothing has landed between 0.7% and 9.5%, so the line has a wide margin on
both sides; if a genuinely shaved style ever trips it, lower `HAIR_COVERAGE_FLOOR` in
`lib/sheet.mjs` rather than removing the check.

A sheet with a bald panel is **re-rolled up to `--sheet-retries` times** (default 2), with a
prompt that names the quadrant that failed — a plain re-roll of the same prompt tends to skip a
head again, and often the same one. The best attempt is kept, not the last, and anything still
bald after the retries is written anyway, flagged in `manifest.json`, outlined in red on the
contact sheet, and listed at the end of the run with the `--force` command to redo it. The run
exits non-zero.

To audit what is already on disk — sheets from before the check existed, or a run you want to
re-verify — `--check` measures every sheet, needs no key and costs nothing:

```bash
npm run mannequins -- --check                 # every sheet
npm run mannequins -- --check --gender male   # or a subset
```

It prints the per-panel coverage, records the verdict in `manifest.json` so the contact sheet
flags the bad sheets, and ends with the exact command to regenerate them.

## Output

```
assets/mannequins/
  _base/male-front.png …                  the 6 base heads
  low-taper-fade/curly/male-front.png …   <styleId>/<variant>/<gender>-<angle>.png
  buzz-cut/any/male-front.png …           a style the matrix says needs one render
  manifest.json                           styleId -> variant -> gender -> angle -> { file, url, prompt }
  index.html                              contact sheet, one block per variant
```

The variant directory is the matrix on disk: a style has exactly the subdirectories its `variants`
row asks for, and nothing else.

## The app picks these up on its own

Every run ends by rewriting `src/api/mannequinRenders.generated.ts` — one `require()` per PNG
on disk — and a long run does it again after each finished style. Metro fast-refreshes on that
module, so a style generated while `npm start` is running shows up in the app by itself:

```bash
npm run mannequins -- --sheet --gender male --style crew-cut --hair-type curly
# … ✓ [1/1] crew-cut curly/male -> crew-cut/curly/male-sheet.png (+4 views)
# App renders: … — 104 view(s) across 26 variant(s) of 26 style(s) (updated)
```

The map is rebuilt from the whole directory every time, so styles generated on earlier runs stay
in it; nothing is appended and nothing is hand-edited. `<Mannequin styleId=…>` then prefers the
render matching that style, gender and angle, and keeps drawing the procedural silhouette for
every style that has none — so a half-generated catalog is a mix, never a wrong image.

The file is code rather than data because Metro only bundles an asset that some module requires
by a literal path. Renders that arrive some other way (a teammate's commit, a hand-dropped file)
are picked up by the same scan, which also runs on `npm start`:

```bash
npm run mannequins:sync        # free — reads a directory listing, calls nothing
```

`manifest.json` is the handover to the backend: it is the seed for the hairstyle image rows in
the Railway database — keyed by style, then variant, then gender, then angle, so the matrix
travels with the images — and it keeps the exact prompt used for each image so a single style can be
regenerated later without guessing. The `url` values are fal-hosted and expire — the PNGs are the
durable copy, to be rehosted alongside the API.

Note that `Hairstyle` currently has one `imageUrl`, while this produces variant × gender × angle
images. Wiring that up is a catalog-shape change (`imageUrl` → per-variant, per-gender, per-angle
urls) and belongs with the backend work, not here.

The four angles here are the four the style detail screen offers, and they carry the same names
(`front`, `half`, `side`, `back`), which is how `mannequinRenders.generated.ts` maps a file onto
a view.

Changing `HAIR_COLOUR` means re-shooting the catalog *and* re-measuring `BASE_HAIR_COLOR.hex` in
`src/lib/constants.ts` (`node scripts/measure-hair-tone.mjs`): the app's colour grade is anchored
to the mean hair tone of the renders that came back, which is a shade off whatever the prompt
asked for.

## Hair masks

`generate-hair-masks.mjs` writes a `<gender>-<angle>-mask.png` beside every render: greyscale,
white where the haircut is. The app grades the hair to the user's chosen shade and needs to know
where to stop — without a mask the grade covers the frame, which tints the mannequin slightly and
lands hardest on the shadow under the jaw.

No model is involved and nothing is paid for; it is arithmetic over pixels already on disk
(`lib/hairMask.mjs`). Backdrop, plastic and hair separate on luminance, and the two cases
luminance alone gets wrong are settled by region: a bright strand sealed inside the hair mass is
hair, and a dark region sealed inside the plastic is shading on the head. It leans entirely on the
house style — dark hair, matte white plastic, flat white ground — so it is worth a look after any
change to `HOUSE_STYLE`.

```bash
npm run mannequins:masks                                  # every render missing a mask
node scripts/generate-hair-masks.mjs --style afro --force # redo one style
node scripts/generate-hair-masks.mjs --preview masks.png  # render | mask | graded, to eyeball
```

`--preview` is the check that matters: anything on the *mannequin* that changes colour in the
third column is a mask error. Coverage outside 2–85% of the frame is warned about by name — a 0%
mask usually means the render itself came back bald, which is a generation to re-roll rather than
a mask to fix.

You rarely need to run it: `writeRenderModule` masks any render whose mask is missing or older
than it, so a generator run and `npm start` both keep them in step.

## The hair-type picker's examples

A separate, much smaller generator, and deliberately not a flag on this one:

```bash
npm run hair-types -- --dry-run          # the prompt, free, no key
npm run hair-types -- --gender male      # one generation, ~$0.04
npm run hair-types -- --gender female
npm run hair-types -- --gender both -y   # both in one go
```

**Two images in the whole set.** Each is a 2x2 grid of the four hair types on one head — type 1
top left, type 4 bottom right — cut here into `assets/hair-types/<gender>-<type>.png`. The user
has declared a gender by the time the picker is shown, so gender is the axis the *images* vary
along and the four types are the panels of each one. One generation per gender rather than four,
for the same reason the catalog uses a sheet: drawn in one pass the model commits to one head and
shows it four ways, which is the whole point of an image whose only variable is the curl pattern.

It is a different photograph from the catalog's, and `lib/hairTypePrompts.mjs` is where that
lives:

| | Catalog | Hair-type examples |
| --- | --- | --- |
| Subject | a haircut, from the catalog record | what hair *does* — the same plain hair in every panel, at the length that gender wears it |
| Panels | four camera angles of one style | four hair types on one head |
| Production | an edit of the approved base sheet | one text-to-image generation |
| Afterwards | hair mask + colour grade in the app | shown exactly as generated |
| Failure to catch | a panel left bald | a panel left bald, **or** two panels drawn as the same texture |

What the two share is the object: `BLANK_FACE`, `MATERIAL`, `LIGHTING`, `BACKDROP` and
`HAIR_COLOUR` are imported from `lib/prompts.mjs` rather than restated, and the four type
descriptions are the same `HAIR_TYPES` the catalog's `Hair type:` line is written from — reword a
type there and it is reworded in both. The framing is the part that deliberately differs: the
crop is tight on the head, with no neck plate and no display base, because these are shown at the
size of a list row where a catalog framing would be mostly white plastic.

Every sheet is measured. A panel with no hair on it is re-rolled by name on the same measured 3%
coverage line the catalog sheets use. Two panels that come back as the *same* texture are
reported and recorded — the run prints how far apart all six pairs are — but not re-rolled: that
threshold (`SILHOUETTE_FLOOR` in `lib/hairTypeSheet.mjs`) is an estimate until a few runs have
been looked at, and spending re-rolls on an uncalibrated number is worse than printing it.

```
assets/hair-types/
  male-sheet.png     the generation, kept — a panel can be re-cut for free
  male-straight.png  male-wavy.png  male-curly.png  male-coily.png
  female-…
  manifest.json      gender -> { sheet: { prompt, url, coverage, distance }, straight: {…}, … }
```

The picker picks these up the same way the catalog does: every run rewrites
`src/api/hairTypeExamples.generated.ts`, `npm start` syncs it, and `app/try/hair-type.tsx` shows
the type's icon until a full set exists for that gender. There are no masks and no grade — an
example of a texture has no shade to be put in.

```bash
npm run hair-types:sync                   # rebuild the app map from disk — free, no key
npm run hair-types -- --slice --inset 4   # re-cut the sheets on disk — free, no key
```

## Options

`--help` lists them all. The ones that matter:

| Flag | Why |
| --- | --- |
| `--matrix` | print the hairstyle x hair type matrix, the cost and what is missing — free, no key, no generation |
| `--hair-type <t>` | `straight,wavy,curly,coily,any` or `all` — narrow a run to one batch (default: every variant the matrix asks for) |
| `--style <ids>` / `--limit <n>` | generate a subset — `--limit` takes the most popular first |
| `--gender male\|female\|both`, `--angle front,side,back` | narrow a run; `--angle front` alone is enough for catalog cards |
| `--dry-run` | prints the plan and every prompt, calls nothing, needs no key |
| `--force` | regenerate style images that already exist |
| `--check` | measure the sheets already on disk for bald panels — free, no key, no generation |
| `npm run mannequins:sync` | (not a flag) rebuild the app's render map alone — every run does this for you |
| `--sheet-retries <n>` | re-rolls allowed when a sheet comes back with a bald head (default: 2) |
| `--force-base` | also regenerate the base heads — they are kept by default, since every style image inherits them |
| `--seed <n>` | reproducible re-runs |
| `--reference <file>` | swap the look reference that seeds the base heads |
| `--model` / `--edit-model` | swap models — defaults are `fal-ai/nano-banana` and `fal-ai/nano-banana/edit` |
| `--no-edit` | one-shot text-to-image per style instead of editing a base head (worse consistency; only if the edit model disappoints) |
| `--catalog-url <url>` | read the catalog from the live API instead of `mockCatalog.ts` |

## Cost

Roughly $0.04 per image at nano-banana list price. In sheet mode that is one generation per
style x variant x gender: **130 for the whole catalog, of which 25 are done** — about **$4.20**
left, against **$5.76** if every style were shot once per hair type. `--matrix` prints the current
number rather than this one. Check
fal.ai/pricing — the script prints its estimate and asks for confirmation on runs of more than
four images.
