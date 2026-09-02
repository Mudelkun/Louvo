# Hairify — frontend prototype

React Native / Expo app for trying hairstyles on your own photo. **This is phase 1: the
complete, navigable frontend.** Image generation, the API server, and the database are not
connected — everything that would hit a backend is served from mock data behind a simulated
network delay.

## Running it

```bash
npm install
npm start          # then press i / a, or scan the QR code with Expo Go
npm run web        # runs in a browser
npm run typecheck  # tsc --noEmit
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
| `app/try/style/[id].tsx` | Step 5 — style detail: four views, a hair-type switcher, add the photo, then generate |
| `app/try/result.tsx` | The look, with save / share / compare |
| `app/try/compare.tsx` | Before / after — draggable wipe or side by side |
| `app/try/more-styles.tsx` | "More styles for you" recommendations |
| `app/try/share.tsx` | Share sheet (simulated) |

Generation does not hold the user hostage: tapping **Generate my preview** queues the job and
drops the user on **Profile → My looks**, where the preview appears as a processing tile. When it
finishes, the look is written into the library and a notification banner offers to open it.

Everything is interactive: selections persist, favourites and saved looks survive a restart
(AsyncStorage), and the mannequin preview updates live as options change.

## What is simulated

| Area | Now | Later |
| --- | --- | --- |
| Catalog | `src/api/mockCatalog.ts` | `GET /catalog` from the Railway database |
| Mannequin images | The renders in `assets/mannequins/` where a style has one for that hair type, the `shape` descriptor (`src/lib/hairShape.ts`) drawn locally where it does not | The same renders served by the API as `hairstyle.imageUrl` |
| Hair type examples | The four textures in `assets/hair-types/`, one set per gender (`npm run hair-types`); the type's icon where they have not been generated | The same images served by the API beside the hair type rows |
| Preview generation | Queued in the background (`src/state/GenerationContext.tsx`), ~6s, returns the original photo | Fal.ai via the API server, polled from the same context |
| "Look is ready" notification | In-app banner (`src/components/LookNotification.tsx`) | Real push via expo-notifications |
| Sharing | Logs and shows a "shared" state | System share sheet with the real image |
| Accounts | Guest only, device-local storage | `/me/favourites`, `/me/looks` |

Every simulated surface says so in the UI — nothing pretends to be real.

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
- **The cut is the product.** The only thing a style exposes is the haircut: no length, no fade
  level and — for now — no colour. Renders are shot in a fixed shade per variant (espresso, and
  black for `coily`, whose coils read muddy in brown) and the app grades from whichever anchor the
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

## Layout

```
app/                 expo-router routes (see table above)
src/api/             types, mock catalog, client — the backend seam
src/components/      UI kit: Mannequin, StyleCard, Controls, BeforeAfter, Screen, …
src/state/           CatalogContext (catalog), SessionContext (try-on), LibraryContext (saved)
src/lib/hairShape.ts procedural mannequin silhouettes derived from catalog data
src/lib/hairTypes.ts hairstyle x hair type matrix, read (the matrix itself is catalog data)
src/api/mannequinRenders.generated.ts  generated: the mannequin PNGs on disk, by style + variant
src/theme/theme.ts   design tokens
```
