# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 is built: a complete, navigable **frontend prototype**. No backend, no database, no
image generation — every call that would hit a server is served from mock data behind a
simulated delay. See `README.md` for the screen map and what is simulated.

Commands (run from the repo root):

```bash
npm install
npm start          # Expo dev server (syncs the generated render + example maps first)
npm run ios / android / web
npm run typecheck  # tsc --noEmit
npm run mannequins -- --matrix   # the hairstyle x hair type matrix — free, no key
npm run hair-types -- --dry-run  # the hair-type picker's examples — free, no key
```

There is no test setup and no linter configured yet. `npm run typecheck` is the check to run
after changes.

Reference material: `project.md` (product spec) and `App-reference.png` (the original flow
mockup — treated as inspiration, not a spec; the implemented design departs from it).

## What Hairify is

A React Native / Expo mobile app for virtually trying hairstyles. The user flow: upload a photo → pick gender → pick hair type → browse the catalog → generate an AI preview of themselves with that style → compare before/after, save, share.

The user picks a haircut. The length and fade-level controls the spec originally called for are gone from the app: the cut is the product.

Hair type *is* a property of a hairstyle — see the matrix section below — and is generated.
Colour is not a property of a hairstyle and is not generated. Every mannequin — drawing and AI render alike — is produced in one shade (`BASE_HAIR_COLOR` in `src/lib/constants.ts`) and recoloured on screen by `src/lib/colorGrade.ts`. **There is no colour picker in the UI right now.** The grade, the masks and the session's `colorId` are all live and working; nothing sets `colorId`, so every mannequin renders at the identity grade — the untouched render. Putting the choice back is a `<SwatchRow>` bound to `setColor`, and the reason it is worth keeping intact is below.

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

**Colour is a grade, not a generation.** A hairstyle has no colour; the catalog is shot in a fixed
shade and the app maps that render onto the chosen shade at display time.

There are **two** such shades, not one: everything is espresso except the `coily` variant, which is
shot in black, because espresso reads as a muddy mid-brown on type 4 coils — a dense zig-zag
texture is mostly self-shadow, with very little lit surface left to carry a hue. That is still not
colour-per-style: no hairstyle has its own shade, and nobody picks these. It only means the grade
has two anchors instead of one, so `<Mannequin>` resolves the render's variant first and grades
from `baseHairColor(variant)` (`BASE_HAIR_COLORS` in `src/lib/constants.ts`) rather than from one
catalog-wide constant. Grading a black coily render from the espresso anchor overshoots every
target, which is the bug that indirection exists to prevent. When the
picker is out of the UI the chosen shade is simply the base one, which grades to an identity and
short-circuits to the plain render. The whole
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

## Where the backend plugs in

`src/api/client.ts` is the only module that knows the data is mocked. It holds a `USE_MOCKS`
flag and a `TODO(backend)` at each call site. The exported signatures are the contract the
screens depend on — keep them stable and nothing in `app/` needs to change.

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
