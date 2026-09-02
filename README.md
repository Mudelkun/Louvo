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

Photo → gender → category → browse → style → generate → result, with compare,
share, save and recommendations hanging off the result.

| Route | Screen |
| --- | --- |
| `app/welcome.tsx` | First-launch intro (shown once, replayable from Settings) |
| `app/(tabs)/index.tsx` | **Try on** — upload / take / sample photo, trending, categories |
| `app/(tabs)/styles.tsx` | **Styles** — full catalog with search, gender and category filters |
| `app/(tabs)/profile.tsx` | **Profile** — My looks grid (large tiles, in-progress previews first) and favourited styles; gear in the header opens settings |
| `app/(tabs)/discover.tsx` | **Discover** — placeholder, not designed yet |
| `app/settings.tsx` | Settings — preferences, data controls, build info |
| `app/try/gender.tsx` | Step 1 — who are we styling |
| `app/try/categories.tsx` | Step 2 — pick a category |
| `app/try/catalog.tsx` | Step 3 — browse the catalog |
| `app/try/style/[id].tsx` | Step 4 — style detail: front / half / side / back views, add the photo, then generate |
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
| Mannequin images | The renders in `assets/mannequins/` where a style has them, the `shape` descriptor (`src/lib/hairShape.ts`) drawn locally where it does not | The same renders served by the API as `hairstyle.imageUrl` |
| Preview generation | Queued in the background (`src/state/GenerationContext.tsx`), ~6s, returns the original photo | Fal.ai via the API server, polled from the same context |
| "Look is ready" notification | In-app banner (`src/components/LookNotification.tsx`) | Real push via expo-notifications |
| Sharing | Logs and shows a "shared" state | System share sheet with the real image |
| Accounts | Guest only, device-local storage | `/me/favourites`, `/me/looks` |

Every simulated surface says so in the UI — nothing pretends to be real.

## Connecting the backend

`src/api/client.ts` is the only file that knows the data is fake. It exports the exact
function signatures the screens use, each with a `TODO(backend)` marking the `fetch` to
write. Flip `USE_MOCKS` to `false`, fill those in, and no screen changes.

Two rules the code already respects, from the spec:

- **The catalog is data, not code.** No screen contains a hairstyle name. Categories and
  styles arrive from the catalog and are rendered generically. Adding a style is a data change.
- **The cut is the product.** The only thing a style exposes is the haircut: no length and no
  fade level. Colour is the one exception, and it is not a property of a style — it is one
  shade applied to every mannequin on screen at once (the swatch row on the style screen), so
  two cards side by side still differ only by their cut. Everything is generated and drawn in
  `BASE_HAIR_COLOR` (`src/lib/constants.ts`) and recoloured in the app by
  `src/lib/colorGrade.ts`; the generator has no colour of its own any more. The recolour is held
  to the haircut by a per-render hair mask (`npm run mannequins:masks`), so the mannequin itself
  never changes colour.
- **Catalog imagery is neutral mannequins.** `<Mannequin>` renders a faceless, feature-free
  head with identical proportions for every style; only the hair changes. Given a `styleId` it
  prefers the generated render for that style, gender and angle (`assets/mannequins/`, wired up
  by `npm run mannequins:sync`) and falls back to the drawing, so generating a style is all it
  takes to see it in the app. `hairstyle.imageUrl` still wins over both once the backend
  serves it.

## Layout

```
app/                 expo-router routes (see table above)
src/api/             types, mock catalog, client — the backend seam
src/components/      UI kit: Mannequin, StyleCard, Controls, BeforeAfter, Screen, …
src/state/           CatalogContext (catalog), SessionContext (try-on), LibraryContext (saved)
src/lib/hairShape.ts procedural mannequin silhouettes derived from catalog data
src/api/mannequinRenders.generated.ts  generated: the mannequin PNGs on disk, by style
src/theme/theme.ts   design tokens
```
