# Hairify — frontend prototype

React Native / Expo app for trying hairstyles on your own photo. **This is phase 1: the
complete, navigable frontend**, plus the one piece of it that is now real — the preview
itself. The API server and the database are still not connected: the catalog and everything
else that would hit a backend is served from mock data behind a simulated network delay.

**Previews are generated.** With `EXPO_PUBLIC_FAL_KEY` set, pressing *Generate my preview*
sends the user's photo and the catalog's own mannequin renders of the chosen cut to an image
model, which is told to change the hair and nothing else. Without the key the app behaves
exactly as it did before and simulates the preview instead. See *Try-on generation* below.

## Running it

```bash
npm install
npm start          # then press i / a, or scan the QR code with Expo Go
npm run web        # runs in a browser
npm run typecheck  # tsc --noEmit

# One preview from the command line, without a phone. --dry-run is free.
npm run try-on -- --photo me.jpg --style low-taper-fade --hair-type coily
npm run try-on -- --photo me.jpg --style buzz-cut --dry-run
npm run try-on -- --styles           # which hairstyles have renders to reference

npm run icons      # re-cut the launcher icon set from the artwork — free, no key
```

## The flow

Photo → gender → hair type → browse → style → generate → result, with compare,
share, save and recommendations hanging off the result.

| Route | Screen |
| --- | --- |
| `app/welcome.tsx` | First-launch intro (shown once, replayable from Settings) |
| `app/(tabs)/index.tsx` | **Try on** — upload / take / sample photo |
| `app/(tabs)/styles.tsx` | **Styles** — full catalog with search, gender, hair type and category filters, and a sort order |
| `app/(tabs)/profile.tsx` | **Profile** — My looks grid (large tiles, in-progress previews first) and favourited styles; gear in the header opens settings |
| `app/(tabs)/discover.tsx` | **Discover** — placeholder, not designed yet |
| `app/settings.tsx` | Settings — preferences, data controls, build info |
| `app/try/gender.tsx` | Step 2 — who are we styling |
| `app/try/hair-type.tsx` | Step 3 — straight / wavy / curly / coily, or All Types, each shown with a generated example of the pattern |
| `app/try/catalog.tsx` | Step 4 — browse the whole catalog; category is a chip row, not a step |
| `app/try/style/[id].tsx` | Step 5 — style detail: four views, a hair-type chooser, add the photo, then generate |
| `app/try/generating.tsx` | The wait — scissors working across the photo, the stage in words, the countdown; opens the result itself |
| `app/try/result.tsx` | The look, with save / share / compare |
| `app/try/compare.tsx` | Before / after — draggable wipe or side by side |
| `app/try/more-styles.tsx` | "More styles for you" recommendations |
| `app/try/share.tsx` | Share sheet (simulated) |

Generation does not hold the user hostage, but it no longer throws them out of the flow either.
Tapping **Generate my preview** queues the job and opens **`/try/generating`**: the user's own
photo at full size with a pair of scissors snipping their way across it, a progress frame closing
around it, the stage narrated in a word that changes every second or so, and a countdown that only
ever counts down. When the job lands, the frame closes and the screen opens the result on its own.

Both exits are in the footer and neither touches the job. *Keep browsing* drops the user on
**Profile → My looks**, where the preview is still a processing tile — and that tile is now a way
back in, not a lesser copy of the wait: tapping it reopens `/try/generating`. Leaving costs the
view, not the job. A finished look is written into the library either way, and the notification
banner offers to open it for anyone who is elsewhere in the app.

Nothing on that screen invents progress. The frame and the percentage are the generator's own
`progress`, eased so they never sit still between polls; the countdown ratchets — each report may
only pull the deadline *earlier*, so it never grows while someone watches it. The scissors and the
band they ride are liveness cues on their own timers and are not claims about the job. The word
under the photo changes every second or so, but `STAGE_WORDS` holds one pool per generation stage
and the pool is picked by the job's real `stepIndex`, so the word is always true of what is
happening — which word it is, is pacing. See the header comments in
`src/components/GenerationStage.tsx`.

Everything is interactive: selections persist, favourites and saved looks survive a restart
(AsyncStorage), and the mannequin preview updates live as options change.

## What is simulated

| Area | Now | Later |
| --- | --- | --- |
| Catalog | `src/api/mockCatalog.ts` | `GET /catalog` from the Railway database |
| Mannequin images | The renders in `assets/mannequins/` where a style has one for that hair type, the `shape` descriptor (`src/lib/hairShape.ts`) drawn locally where it does not | The same renders served by the API as `hairstyle.imageUrl` |
| Hair type examples | The four textures in `assets/hair-types/`, one set per gender (`npm run hair-types`); the type's icon where they have not been generated | The same images served by the API beside the hair type rows |
| Preview generation | **Real** — Fal.ai called straight from the app (`src/api/tryOn.ts`), queued in the background (`src/state/GenerationContext.tsx`). Falls back to the old ~6s simulation for the sample photo and when no key is set | The same call from the API server, so the key stops shipping in the app |
| "Look is ready" notification | In-app banner (`src/components/LookNotification.tsx`) | Real push via expo-notifications |
| Sharing | Logs and shows a "shared" state | System share sheet with the real image |
| Accounts | Guest only, device-local storage | `/me/favourites`, `/me/looks` |

Every simulated surface says so in the UI — nothing pretends to be real. That cuts both ways:
a look records whether it was generated (`GeneratedLook.simulated`), and the result screen and
the settings notice both read it, so a real preview is never labelled a simulation and a
simulation is never labelled a preview.

## Try-on generation

The user picks a haircut; the model is never told its name as an instruction. It is handed
**the user's photo** as the image to edit and **the catalog's own render of the chosen cut** —
the hero three-quarter view, the same image on the card the user tapped — as reference, with
the declared hair type named in words. The instruction is about a hundred and thirty words and says one
thing: change the hair to match the reference, return the same photograph otherwise.

Asking a model for "a buzz cut" gets a different buzz cut every time and never the one on the
card; showing it the card is what makes the preview a preview of *that* style.

### The model

`fal-ai/nano-banana-2/edit` on fal, set by `TRY_ON_MODEL` in `src/api/tryOn.ts` and overridable
with `EXPO_PUBLIC_FAL_TRY_ON_MODEL` (the terminal script reads `FAL_TRY_ON_MODEL`, or takes
`--model`). It is the same model the catalog generators run (`--edit-model`, or `FAL_EDIT_MODEL`),
at $0.08 an image — the two paths are separate decisions and free to differ, but there is nothing
to be gained by differing right now.

**It was `openai/gpt-image-2/edit`, and that came back.** gpt-image is billed by token: one
measured preview came to $0.20 against a flat $0.08, so roughly 2.5x, or $200 against $80 per
thousand. The money was accepted at the time; the behaviour is what sent it back —

- **It re-renders the whole frame** rather than editing pixels in place, so "return the same
  photograph otherwise" is approximated rather than guaranteed, and identity drifts more than it
  did.
- **Its output sizes are a fixed set** (1024 square, 1536x1024, 1024x1536), so a photograph that
  is neither square nor 3:2 comes back resampled.

The request body is identical either way (`prompt`, `image_urls`, `num_images`, `output_format`),
which is why the switch is one constant, and why going back is an env var rather than an edit.

The generators moved there from `fal-ai/nano-banana/edit` after the men × curly batch, and the
earlier renders were **not** re-shot. Consistency across the catalog is the point of the house
style, so that needs a reason: in sheet mode every style is an edit of the composed
`_base/<gender>-sheet.png`, which means head, material, lighting, crop and framing come from one
approved image regardless of model and only the hair rendering can drift. What the extra four cents
buys is prompt adherence — the bald-quadrant re-roll `--sheet-retries` exists for. `--model`, the
text-to-image side, is still `fal-ai/nano-banana`; it runs only for `--no-edit` and for base heads
generated without a reference.

**`scripts/try-on.mjs` is on the app's model**, so a prompt written there is a prompt the app
sends — which is the whole point of the script importing `src/lib/tryOnPrompt.ts` rather than
copying it. It was on the cheaper `fal-ai/nano-banana/edit` for as long as the app ran gpt-image-2
at 2.5x, and every prompt written in the cheap loop then had to be re-confirmed against the app's
model. `--model` still runs a different one:

```bash
npm run try-on -- --photo me.jpg --style low-taper-fade                                  # what the app sends
npm run try-on -- --photo me.jpg --style low-taper-fade --model openai/gpt-image-2/edit  # what it used to
npm run try-on -- --photo me.jpg --style low-taper-fade --no-reference                   # no reference image
```

The model is in the default output filename, so those write
`try-on-low-taper-fade-nano-banana-2.png` and `try-on-low-taper-fade-gpt-image-2.png` rather than
one clobbering the other.

`--no-reference` sends the photo on its own and lets the cut arrive as its name and description —
`tryOnPrompt`'s existing fallback for a style with no render yet. It is how you measure what the
reference is buying: described rather than shown, a cut is whatever the model already thinks that
name means, and a different one each run.

### Two images, not five

The first version sent all four angles. It failed hard: with five images in the request the
model stopped editing the photograph and started composing across the set, and what came back
was a studio portrait on the mannequin's grey ground, at the mannequin's crop, wearing a
stranger's face. Four references outvoted one photograph.

So the reference is one view — the `half` hero. That is weaker than it should be: every render
on disk predates the base-head fix, so `half` is actually a full profile and a mirror of `side`,
with no front hairline or fringe in it. The fix is one reference image that *contains* four
views — the composed `<gender>-sheet.png` the generator already writes, downscaled and bundled,
which keeps the image count at two. Not wired up yet. **Do not fix it by adding images back** —
`npm run try-on -- --views front,half,side,back` reproduces the failure on demand.

### Reference coverage

The catalog was shot curly and is part-way through coily, so more than half the style x
hair-type combinations have no render for the declared type. The reference therefore falls back
to *any* variant of the same cut, with the user's real texture named in words and the mismatch
stated outright ("the reference is modelled on Type 3A-3B curly hair, which is not this
person's: take the cut's shape, length and outline from it, not its texture"). Before that,
those previews degraded silently to a name-only prompt and the model routinely returned the
photo unchanged.

The display layer does *not* do this: `variantCandidates()` stays strict, because the wrong
render on screen is a wrong image. The reference is not on screen and supplies geometry only.

### The instruction

`INSTRUCTION` in `src/lib/tryOnPrompt.ts` is authored prose — edit it as prose, not a clause at
a time. The code contributes only what the author cannot know in advance: which image is which,
the cut's name, the user's hair type, and the colour rule.

Keep it short. The version before it enumerated every facial feature to preserve and every
property of the photograph to leave alone; the model read that as a list of things to draw, and
among the things it drew was a beard the prompt had asked it to leave alone by name.

But not *only* short. With the cut's name left out, every emphatic sentence in the prompt was a
preservation sentence — keep exactly the same, do not modify or regenerate — and the model
started returning the photo untouched, which is a fair reading of a request that only ever says
what not to do. `styleLine` names the cut (as a label on the reference, not as the brief) and
adds the one sentence that grants permission to change anything: the hair must visibly change,
including where that means cutting or removing what is there.

| File | What it does |
| --- | --- |
| `src/lib/tryOnPrompt.ts` | The instruction. The one place the wording lives — `scripts/try-on.mjs` imports this exact file |
| `src/api/tryOn.ts` | Resolves the reference, encodes the images, calls the model. `REFERENCE_VIEWS` is the image-count decision |
| `src/api/fal.ts` | The queue client (submit, poll, fetch) |
| `src/lib/imageData.ts` | Bundled asset and local photo to a `data:` uri; the finished look to a file on the device |
| `scripts/try-on.mjs` | The same generation from a terminal, for iterating on the prompt |

Colour is not sent. The catalog's shade is a studio convention and the session's colour is a
display default, so a preview keeps the subject's own hair colour — the cut is what is being
previewed. `GenerateRequest.hairColor` is the seam for the day a colour picker exists.

**The key ships in the app.** `EXPO_PUBLIC_FAL_KEY` is compiled into the bundle and anybody
with the app can read it out. That is fine for a prototype on a capped, rotatable key and
nothing else; moving the call behind the Railway API is what phase 2 is for.

## Connecting the backend

`src/api/client.ts` is the only file that knows the data is fake. It exports the exact
function signatures the screens use, each with a `TODO(backend)` marking the `fetch` to
write. Flip `USE_MOCKS` to `false`, fill those in, and no screen changes.

Four rules the code already respects, from the spec:

- **The catalog is data, not code.** No screen contains a hairstyle, category or hair type name.
  They all arrive from the catalog and are rendered generically. Adding a style is a data change.
- **Hair type is the primary dimension, and it is a matrix rather than a multiplier.** The user
  declares straight / wavy / curly / coily (or All Types) before browsing; it decides which styles
  are offered and which render of each is shown. Each style carries a `variants` row saying which
  of the four types share a render — 103 renders across the 36 styles instead of 144. Run
  `npm run mannequins -- --matrix` for the whole table, the cost, and what is still missing.
  `Straight`, `Wavy` and `Curly` are no longer categories: that asked the same question twice.
  Under **All Types** a card shows every render the cut has, cross-fading between them with a
  caption naming the types each stands for — the matrix, visible from the grid without opening
  anything. Only renders that exist and differ are cycled, so a style shot in one texture (and,
  today, the whole women's catalog) simply stands still.
- **The cut is the product.** The only thing a style exposes is the haircut: no length, no fade
  level and — for now — no colour. Renders are shot in a fixed shade per variant (espresso, and
  black for `curly` and `coily`, whose texture reads muddy in brown) and the app grades from whichever anchor the
  render it is showing was shot in (`BASE_HAIR_COLORS` in `src/lib/constants.ts`), so two cards
  side by side differ only by their cut.

  The recolouring machinery is built and dormant rather than absent: `src/lib/colorGrade.ts`
  maps a render onto any shade, held to the haircut by a per-render hair mask
  (`npm run mannequins:masks`) so the mannequin itself never changes colour, and the session
  carries a `colorId`. With no picker in the UI nothing sets it, the grade comes out an identity
  and renders are shown untouched. Bringing colour back means rendering `<SwatchRow>` against
  `catalog.colors` — it would be one session-wide shade, never a per-style property, or cards
  would start differing by something other than the cut.
- **Catalog imagery is neutral mannequins.** `<Mannequin>` renders a faceless, feature-free
  head with identical proportions for every style; only the hair changes. Given a `styleId` it
  prefers the generated render for that style, hair-type variant, gender and angle
  (`assets/mannequins/`, wired up by `npm run mannequins:sync`) and falls back to the drawing, so
  generating a style is all it takes to see it in the app. With a hair type declared the variant
  has to match exactly — a curly render is not an honest stand-in for a straight one — and the
  fallback drawing is drawn in the user's own texture instead. `hairstyle.imageUrl` still wins
  over both once the backend serves it.

## The app icon

`assets/Hairify - icon.png` is the artwork — the two half-heads in brass on a black tile — and
it is the *only* icon file anyone edits. Everything the platforms actually load is cut from it
by `npm run icons`:

| File | What it is |
| --- | --- |
| `assets/icon.png` | 1024² RGB, full-bleed. iOS and the stores round the corners themselves. |
| `assets/splash-icon.png` | 1024² RGBA, the rounded tile on transparency, over `#FAF8F5`. |
| `assets/favicon.png` | 48² RGBA, the same silhouette. |
| `assets/android-icon-foreground.png` | 512² RGBA, opaque, subject inside the adaptive safe zone. |
| `assets/android-icon-monochrome.png` | 432² RGBA, white silhouette for Android's themed icons. |

The artwork arrives as an icon *mockup* — the tile is photographed with a drop shadow on a cream
ground — so the script's real job is to throw the mockup away and keep the tile: find it, crop it
square, and either fill outside its rounded silhouette with the tile's own black or make it
transparent, depending on which of the five is being cut. Shipped unprocessed, the mockup would
give every platform a shrunken tile inside a pale border with a shadow baked in, under a second
corner mask.

Two details in there are load-bearing, and both are commented at the code:

- **The ground is bled, not filled.** The tile is lit rather than painted — a couple of levels
  brighter at the top-left than at the bottom-right — so a flat black outside its corners reads
  as a patch at any corner radius other than the tile's own, and the platforms each pick their
  own radius.
- **The Android foreground is full-bleed and opaque.** Fitting the subject into the safe zone
  leaves the tile covering about four fifths of the canvas; padding the rest with transparency
  over a flat `backgroundColor` drew a faint rounded square *inside* the icon, for the same
  reason. It samples with clamped coordinates instead, so the tile's edge carries out to the
  canvas and `backgroundColor` never shows.

## Layout

```
app/                 expo-router routes (see table above)
assets/              the icon artwork, generated mannequin renders, hair-type examples
src/api/             types, mock catalog, client — the backend seam
src/components/      UI kit: Mannequin, StyleCard, Controls, BeforeAfter, Screen, …
src/state/           CatalogContext (catalog), SessionContext (try-on), LibraryContext (saved)
src/lib/hairShape.ts procedural mannequin silhouettes derived from catalog data
src/lib/hairTypes.ts hairstyle x hair type matrix, read (the matrix itself is catalog data)
src/api/mannequinRenders.generated.ts  generated: the mannequin PNGs on disk, by style + variant
src/theme/theme.ts   design tokens
```
