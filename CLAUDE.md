# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 is built: a complete, navigable **frontend prototype**. No backend, no database, no
image generation — every call that would hit a server is served from mock data behind a
simulated delay. See `README.md` for the screen map and what is simulated.

Commands (run from the repo root):

```bash
npm install
npm start          # Expo dev server
npm run ios / android / web
npm run typecheck  # tsc --noEmit
```

There is no test setup and no linter configured yet. `npm run typecheck` is the check to run
after changes.

Reference material: `project.md` (product spec) and `App-reference.png` (the original flow
mockup — treated as inspiration, not a spec; the implemented design departs from it).

## What Hairify is

A React Native / Expo mobile app for virtually trying hairstyles. The user flow: upload a photo → pick gender and hairstyle category → browse the catalog → adjust options (length, fade level, color, volume) → generate an AI preview of themselves with that style → compare before/after, save, share.

## Planned stack

- **Mobile:** React Native with Expo (iOS + Android)
- **Backend:** Node.js API server, hosted on Railway (database also on Railway)
- **AI image generation:** Fal.ai — used both for the per-user hairstyle previews and for generating the catalog's mannequin images

## Architectural constraints from the spec

These are the non-obvious decisions that should shape any implementation:

**The catalog is data, not code.** Hairstyles and their mannequin images must be addable, replaceable, and expandable without shipping an app update. That means the catalog lives server-side (database + hosted image assets) and the app fetches it at runtime — never a hardcoded list bundled into the binary. Application logic references hairstyles by ID; it should not know the specific set of styles that exist.

*How this is honoured today:* the catalog is loaded once by `CatalogProvider` (`src/state/CatalogContext.tsx`) from `src/api/client.ts`. No screen imports `mockCatalog` directly and no screen contains a hairstyle name. Even the style detail screen's adjustment controls are driven by the catalog — `adjustmentsFor()` returns a list of control descriptors and the screen renders whatever it gets.

**Catalog imagery uses neutral mannequins, never photos of real people.** Every hairstyle is modeled by an AI-generated faceless mannequin: no facial features, no identifiable ethnicity, neutral skin/face styling, male and female variants, and a consistent visual style across the whole catalog. The point is to keep the user's attention on the haircut rather than on the person modeling it, so consistency across the catalog matters as much as the quality of any single image. Match `App-reference.png` when generating new mannequins.

**Two distinct image-generation paths.** Mannequin catalog images are generated ahead of time and stored as assets; user previews are generated on demand from the user's uploaded photo. Keep these separate — they have different latency, cost, and caching characteristics.

## Where the backend plugs in

`src/api/client.ts` is the only module that knows the data is mocked. It holds a `USE_MOCKS`
flag and a `TODO(backend)` at each call site. The exported signatures are the contract the
screens depend on — keep them stable and nothing in `app/` needs to change.

Until the AI mannequin renders exist, `<Mannequin>` draws each style procedurally from its
`shape` descriptor (`src/lib/hairShape.ts`). It already prefers `hairstyle.imageUrl` when the
catalog provides one, so real renders drop in as a data change.
