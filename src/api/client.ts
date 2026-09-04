/**
 * Hairify API client.
 *
 * The one module that knows where the data comes from, which is the whole point
 * of it: every screen calls these functions and none of them can tell whether
 * the answer arrived over a network.
 *
 * The catalog is now **real** when `EXPO_PUBLIC_API_URL` is set — metadata from
 * Postgres on Railway, imagery from R2, fetched once at start and cached on the
 * device (`catalogCache.ts`). With the variable unset the app serves
 * `mockCatalog` behind a simulated delay exactly as it always did, so a fresh
 * checkout still runs with no backend, no bucket and no key.
 *
 * What is still simulated: accounts, sharing, and the `generateLook` fallback
 * for a photo with no pixels behind it. Preview generation itself is real — see
 * `tryOn.ts`.
 */

import { setHairTypeExamples } from '@/lib/hairTypeExample';
import { supportsHairType } from '@/lib/hairTypes';
import { saveLookImage } from '@/lib/imageData';

import { readCachedCatalog, writeCachedCatalog } from './catalogCache';
import { mockCatalog } from './mockCatalog';
import { setRenderIndex } from './renderIndex';
import { canGenerateFor, generateTryOn, generationConfigured, type TryOnStage } from './tryOn';
import type {
  Catalog,
  Category,
  GeneratedLook,
  GenerationStep,
  Gender,
  HairColor,
  HairType,
  HairTypeId,
  Hairstyle,
  TryOnOptions,
} from './types';

/**
 * The Railway deployment, or nothing.
 *
 * Deliberately **not** defaulted to a plausible-looking URL. A default pointing
 * at a host that may or may not be deployed turns "no backend configured" into
 * "the backend is down", which is a far worse thing to debug — and it would fire
 * the offline path on every launch of a checkout that never intended to have a
 * server.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** Whether this build has a backend to talk to at all. */
export const hasApi = (): boolean => API_BASE_URL.length > 0;

/** How the catalog on screen was actually obtained. Reported, never guessed. */
export type CatalogSource = 'api' | 'cache' | 'bundled';

/**
 * Where previews are generated, in the same spirit as `CatalogSource`.
 *
 * - **`server`** — a job on the Railway API. The key is not in this build, the
 *   work survives the app being closed, and a notification arrives when it is
 *   done. The one that ships.
 * - **`direct`** — no API url, but a fal key in the bundle. The prototype path:
 *   real previews, generated from the phone, lost if the app is closed.
 * - **`simulated`** — neither. The flow is walked through and the "preview" is
 *   the user's own photo, labelled as such everywhere it appears.
 *
 * Settings prints this. A user looking at a simulation is told it is one.
 */
export type GenerationSource = 'server' | 'direct' | 'simulated';

export const generationSource = (): GenerationSource => {
  if (hasApi()) return 'server';
  return generationConfigured() ? 'direct' : 'simulated';
};

let lastCatalogSource: CatalogSource = 'bundled';

/** What the last `fetchCatalog()` actually managed. Read by Settings. */
export const catalogSource = (): CatalogSource => lastCatalogSource;

const latency = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Random-ish but bounded delay so loading states are visible while testing. */
const networkDelay = () => latency(280 + Math.random() * 320);

/**
 * A request that gives up.
 *
 * `fetch` on a phone behind a captive portal or on a dead cell hangs for a long
 * time and then fails, and the whole browse experience sits behind this one
 * call. Ten seconds and then the cache is a better app than thirty seconds of a
 * spinner over data we already have.
 */
const REQUEST_TIMEOUT_MS = 10_000;

async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GET ${path} -> ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The catalog, and the imagery index that comes with it.
 *
 * Three outcomes in preference order, and the app is honest about which it got
 * (`catalogSource()`):
 *
 * - **`api`** — fetched and cached. The render manifest is installed, so every
 *   `<Mannequin>` draws a CDN url and the bundled renders are never consulted.
 * - **`cache`** — the network failed and a previous catalog is on the device.
 *   Its render urls are content-addressed and so still valid, and the images
 *   behind them are very likely still in the platform image cache. This is what
 *   an offline launch looks like.
 * - **`bundled`** — no API configured, or nothing cached to fall back to. The
 *   mock catalog and the bundled render module, exactly as phase 1 behaved.
 *
 * The render index is installed here rather than in `CatalogProvider` because it
 * has to happen for *whichever* of the three won, and this is the only place
 * that knows which did.
 */
export async function fetchCatalog(): Promise<Catalog> {
  if (!hasApi()) {
    await networkDelay();
    setRenderIndex(null);
    setHairTypeExamples(null);
    lastCatalogSource = 'bundled';
    return mockCatalog;
  }

  try {
    const catalog = await api<Catalog>('/v1/catalog');
    // Not awaited: a failed write is a slower next launch, and making the user
    // wait on AsyncStorage to see a catalog already in hand is the wrong trade.
    void writeCachedCatalog(catalog);
    setRenderIndex(catalog.renders);
    setHairTypeExamples(catalog.hairTypeExamples);
    lastCatalogSource = 'api';
    return catalog;
  } catch (error) {
    const cached = await readCachedCatalog();
    if (cached) {
      if (__DEV__) console.warn(`[catalog] using cached copy: ${(error as Error).message}`);
      setRenderIndex(cached.catalog.renders);
      setHairTypeExamples(cached.catalog.hairTypeExamples);
      lastCatalogSource = 'cache';
      return cached.catalog;
    }

    // The last resort is the bundled catalog rather than an error screen. A
    // first launch with no network is the one case where the procedural
    // drawings earn their keep: the flow is complete and every mannequin is a
    // line drawing, which is a working app rather than a spinner.
    if (__DEV__) console.warn(`[catalog] falling back to bundled data: ${(error as Error).message}`);
    setRenderIndex(null);
    setHairTypeExamples(null);
    lastCatalogSource = 'bundled';
    return mockCatalog;
  }
}

/** The orders the catalog can be read in. Labels belong to the screen. */
export type SortId = 'popular' | 'az' | 'upkeep';

const UPKEEP_ORDER: Record<Hairstyle['maintenance'], number> = { Low: 0, Medium: 1, High: 2 };

const SORTS: Record<SortId, (a: Hairstyle, b: Hairstyle) => number> = {
  popular: (a, b) => b.popularity - a.popularity,
  az: (a, b) => a.name.localeCompare(b.name),
  // Popularity breaks the tie, so each upkeep band still reads best-first.
  upkeep: (a, b) => UPKEEP_ORDER[a.maintenance] - UPKEEP_ORDER[b.maintenance] || b.popularity - a.popularity,
};

export interface HairstyleQuery {
  gender?: Gender | null;
  /**
   * The user's hair type. `null` is "All Types" and filters nothing — the
   * catalog's primary dimension is also the one dimension the user is allowed
   * to decline.
   */
  hairType?: HairTypeId | null;
  categoryId?: string | null;
  /** Result order. Defaults to `popular`, which is how the catalog reads. */
  sort?: SortId | null;
  search?: string | null;
  tag?: string | null;
  limit?: number;
}

/**
 * A filtered slice of the catalog.
 *
 * Screens mostly do not call this: they hold the whole catalog from
 * `CatalogProvider` and re-filter it locally with `filterHairstyles`, which is
 * why that function is exported. This is for the callers that do not already
 * have it, and it goes over the wire so the server stays the thing that defines
 * what a filter means.
 */
export async function fetchHairstyles(query: HairstyleQuery = {}): Promise<Hairstyle[]> {
  if (hasApi()) {
    try {
      const search = new URLSearchParams();
      if (query.gender) search.set('gender', query.gender);
      if (query.hairType) search.set('hairType', query.hairType);
      if (query.categoryId) search.set('category', query.categoryId);
      if (query.sort) search.set('sort', query.sort);
      if (query.search) search.set('q', query.search);
      if (query.tag) search.set('tag', query.tag);
      if (typeof query.limit === 'number') search.set('limit', String(query.limit));
      const { hairstyles } = await api<{ hairstyles: Hairstyle[] }>(`/v1/hairstyles?${search}`);
      return hairstyles;
    } catch (error) {
      // Filtering is a pure function of data the app very likely already has,
      // so a failure here degrades to doing it locally rather than to nothing.
      if (__DEV__) console.warn(`[hairstyles] filtering locally: ${(error as Error).message}`);
    }
  }

  await networkDelay();
  return filterHairstyles(mockCatalog.hairstyles, query);
}

/** Pure filter, exported so screens can re-filter a cached catalog without a round trip. */
export function filterHairstyles(source: Hairstyle[], query: HairstyleQuery): Hairstyle[] {
  const { gender, hairType, categoryId, sort, search, tag, limit } = query;
  const needle = search?.trim().toLowerCase() ?? '';

  const result = source
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    // A style with no variant for this type is not a thinner version of itself,
    // it is a different head of hair — so it is not offered rather than shown
    // with the wrong render. See `variants` in mockCatalog.ts.
    .filter((style) => supportsHairType(style, hairType))
    .filter((style) => (categoryId && categoryId !== 'all' ? style.categoryIds.includes(categoryId) : true))
    .filter((style) => (tag ? style.tags.includes(tag) : true))
    .filter((style) => {
      if (!needle) return true;
      return (
        style.name.toLowerCase().includes(needle) ||
        style.tags.some((t) => t.toLowerCase().includes(needle)) ||
        style.description.toLowerCase().includes(needle)
      );
    })
    .sort(SORTS[sort ?? 'popular']);

  return typeof limit === 'number' ? result.slice(0, limit) : result;
}

export async function fetchHairstyle(id: string): Promise<Hairstyle | null> {
  if (hasApi()) {
    try {
      const { hairstyle } = await api<{ hairstyle: Hairstyle }>(`/v1/hairstyles/${encodeURIComponent(id)}`);
      return hairstyle;
    } catch (error) {
      if (__DEV__) console.warn(`[hairstyle] ${id}: ${(error as Error).message}`);
    }
  }

  await networkDelay();
  return mockCatalog.hairstyles.find((style) => style.id === id) ?? null;
}

/** "More styles for you" — nearest neighbours by shared category and gender. */
export function recommendationsFor(
  source: Hairstyle[],
  styleId: string,
  gender: Gender | null,
  limit = 6,
  hairType: HairTypeId | null = null,
): Hairstyle[] {
  const seed = source.find((style) => style.id === styleId);
  if (!seed) return source.slice(0, limit);

  return source
    .filter((style) => style.id !== styleId)
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    .filter((style) => supportsHairType(style, hairType))
    .map((style) => {
      const shared = style.categoryIds.filter((c) => seed.categoryIds.includes(c)).length;
      const sharedTags = style.tags.filter((t) => seed.tags.includes(t)).length;
      return { style, score: shared * 10 + sharedTags * 4 + style.popularity / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.style);
}

export function categoriesFor(categories: Category[], gender: Gender | null): Category[] {
  return categories
    .filter((category) => (gender ? category.genders.includes(gender) : true))
    .sort((a, b) => a.order - b.order);
}

/** Types 1 to 4, in order. Catalog data, so the picker is server-driven. */
export function hairTypesFor(hairTypes: HairType[]): HairType[] {
  return [...hairTypes].sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Preview generation
// ---------------------------------------------------------------------------

export const GENERATION_STEPS: GenerationStep[] = [
  { id: 'prepare', label: 'Preparing your photo' },
  { id: 'apply', label: 'Applying the hairstyle' },
  { id: 'finalize', label: 'Finalising the result' },
];

export interface GenerateRequest {
  hairstyle: Hairstyle;
  gender: Gender;
  /** The type the preview is for; null when the user browsed "All Types". */
  hairType: HairTypeId | null;
  photoUri: string | null;
  options: TryOnOptions;
  /**
   * The shade the user *chose* to see their hair in, when there is something to
   * choose with.
   *
   * Deliberately not `options.color`, and deliberately not the session colour.
   * The session starts on `DEFAULT_HAIR_COLOR_ID` so the catalog's two shot
   * shades stop reading as two hair colours in one grid (see `constants.ts`) —
   * that is a display default, not a statement about anyone's hair, and feeding
   * it to the generator would hand every user a black-haired preview they never
   * asked for. Left undefined the preview keeps the subject's own colour, which
   * is the honest answer for a preview of a *cut*. Putting a `<SwatchRow>` back
   * in the UI means passing its value here, and nothing else changes.
   */
  hairColor?: HairColor | null;
}

export interface GenerateProgress {
  /** 0..1 */
  progress: number;
  stepIndex: number;
}

/**
 * Where a stage starts, and how far it may creep before the next one begins.
 *
 * Exported because the backend path needs the same numbers: the server reports
 * which of three stages a job is in and nothing about how far through it is, so
 * the easing between reports is the client's job either way. Two copies of these
 * ranges would be two different-looking waits for the same generation.
 */
export const STAGE_RANGE: Record<TryOnStage, [number, number]> = {
  prepare: [0.02, 0.16],
  apply: [0.2, 0.9],
  finalize: [0.92, 0.99],
};

export const STAGE_INDEX: Record<TryOnStage, number> = { prepare: 0, apply: 1, finalize: 2 };

/**
 * Generates one preview, here in the app.
 *
 * Two paths behind one signature, and they are now the *fallback* pair rather
 * than the whole story. With `EXPO_PUBLIC_API_URL` set, generation is a job on
 * the backend and `GenerationProvider` never calls this — see
 * `src/api/previews.ts`. What is left here is what a checkout with no server
 * does:
 *
 * - **A fal key in the bundle** runs `generateTryOn` directly, exactly as the
 *   prototype always did. It dies when the app is closed and the key is readable
 *   by anyone with the binary, which is the whole reason the backend exists.
 * - **Neither** runs the original stepped simulation, which keeps the
 *   sample-photo walkthrough and a bare checkout working end to end.
 *
 * `GeneratedLook.simulated` says which happened, so no screen has to guess, and
 * `generationSource()` says which of the three the build is actually on.
 */
export function generateLook(
  request: GenerateRequest,
  onProgress: (update: GenerateProgress) => void,
): { promise: Promise<GeneratedLook>; cancel: () => void } {
  return canGenerateFor(request.photoUri)
    ? runRealGeneration(request, onProgress)
    : runSimulatedGeneration(request, onProgress);
}

/**
 * The saved record of a generation, however it was produced.
 *
 * Exported for the backend path, which builds the same look out of a job it did
 * not run itself — one shape for a look means the library, the result screen and
 * the share sheet never have to ask where it came from.
 */
export function lookFrom(request: GenerateRequest, resultUri: string | null, simulated: boolean): GeneratedLook {
  return {
    id: `look_${Date.now().toString(36)}`,
    hairstyleId: request.hairstyle.id,
    hairstyleName: request.hairstyle.name,
    gender: request.gender,
    hairType: request.hairType,
    sourcePhotoUri: request.photoUri,
    resultUri,
    options: request.options,
    createdAt: Date.now(),
    simulated,
  };
}

/**
 * The real round trip.
 *
 * Progress is honest about being an estimate: the queue tells us which of three
 * stages we are in and nothing about how far through it is, so each stage creeps
 * asymptotically toward its own ceiling and only a stage change moves the bar
 * properly. A bar that never quite fills is better than one that sits at 40% for
 * forty seconds.
 */
function runRealGeneration(
  request: GenerateRequest,
  onProgress: (update: GenerateProgress) => void,
): { promise: Promise<GeneratedLook>; cancel: () => void } {
  // `canGenerateFor` has already established this, but the narrowing has to be
  // said out loud rather than cast away — this is the one place a null photo
  // would reach the network layer.
  const photoUri = request.photoUri;
  if (!photoUri) return runSimulatedGeneration(request, onProgress);

  const controller = new AbortController();
  let stage: TryOnStage = 'prepare';
  let progress = STAGE_RANGE.prepare[0];

  const report = () => onProgress({ progress, stepIndex: STAGE_INDEX[stage] });

  const creep = setInterval(() => {
    const [, ceiling] = STAGE_RANGE[stage];
    progress += (ceiling - progress) * 0.06;
    report();
  }, 400);

  const promise = (async () => {
    try {
      const outcome = await generateTryOn(
        {
          hairstyle: request.hairstyle,
          gender: request.gender,
          hairType: request.hairType,
          photoUri,
          color: request.hairColor ?? null,
        },
        {
          signal: controller.signal,
          onStage: (next) => {
            stage = next;
            progress = Math.max(progress, STAGE_RANGE[next][0]);
            report();
          },
        },
      );

      // Written to the device before the look is handed over: a look outlives
      // the url it arrived on, and "save to camera roll" needs a file.
      const resultUri = await saveLookImage(outcome.imageUrl, `${request.hairstyle.id}-${Date.now()}.png`);
      progress = 1;
      report();
      return lookFrom(request, resultUri, false);
    } finally {
      clearInterval(creep);
    }
  })();

  return { promise, cancel: () => controller.abort() };
}

/**
 * The original stepped simulation: ~6 seconds of progress, then a look whose
 * `resultUri` is the user's own photo.
 *
 * Still the path for the sample photo — which has no pixels behind it, only a
 * sentinel that draws the procedural mannequin — and for anyone running without
 * a key. It is not a fallback for a *failed* generation: a failure is reported
 * as one, with the retry the job tile already offers.
 */
function runSimulatedGeneration(
  request: GenerateRequest,
  onProgress: (update: GenerateProgress) => void,
): { promise: Promise<GeneratedLook>; cancel: () => void } {
  // No catalog gate here on purpose: whether a preview is simulated is a fact
  // about the *generator* — a missing fal key, or the sample photo that has no
  // pixels behind it — and has nothing to do with where the catalog came from.
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const promise = new Promise<GeneratedLook>((resolve, reject) => {
    const totalMs = 5600;
    const tickMs = 90;
    let elapsed = 0;

    timer = setInterval(() => {
      if (cancelled) return;
      elapsed += tickMs;
      const progress = Math.min(1, elapsed / totalMs);
      const stepIndex = Math.min(
        GENERATION_STEPS.length - 1,
        Math.floor(progress * GENERATION_STEPS.length),
      );
      onProgress({ progress, stepIndex });

      if (progress >= 1) {
        if (timer) clearInterval(timer);
        resolve(lookFrom(request, request.photoUri, true));
      }
    }, tickMs);

    // Surfaces cancellation to any awaiting screen.
    const rejectIfCancelled = setInterval(() => {
      if (cancelled) {
        clearInterval(rejectIfCancelled);
        if (timer) clearInterval(timer);
        reject(new Error('cancelled'));
      }
      if (elapsed >= totalMs) clearInterval(rejectIfCancelled);
    }, tickMs);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Placeholder for the share sheet — phase 3 hands this a real file uri. */
export async function shareLook(look: GeneratedLook, channel: string): Promise<void> {
  await latency(500);
  if (__DEV__) console.log(`[mock] shared ${look.id} to ${channel}`);
}
