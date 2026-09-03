/**
 * Hairify API client.
 *
 * PHASE 1 (now): every call is served from `mockCatalog` behind a simulated
 * network delay. No network, no database, no Fal.ai.
 *
 * PHASE 2 (later): flip `USE_MOCKS` to false and fill in the `fetch` bodies
 * marked `TODO(backend)`. The exported function signatures are the contract the
 * screens depend on — keep them stable and nothing in `app/` needs to change.
 */

import { supportsHairType } from '@/lib/hairTypes';
import { cacheRemoteImage } from '@/lib/imageData';

import { mockCatalog } from './mockCatalog';
import { canGenerateFor, generateTryOn, type TryOnStage } from './tryOn';
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

const USE_MOCKS = true;

/** Railway deployment target, read from app config once the API exists. */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://hairify.up.railway.app';

const latency = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Random-ish but bounded delay so loading states are visible while testing. */
const networkDelay = () => latency(280 + Math.random() * 320);

function assertMocks() {
  if (!USE_MOCKS) {
    throw new Error('Real API not implemented yet — see TODO(backend) in src/api/client.ts');
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export async function fetchCatalog(): Promise<Catalog> {
  assertMocks();
  // TODO(backend): return (await fetch(`${API_BASE_URL}/catalog`)).json();
  await networkDelay();
  return mockCatalog;
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

export async function fetchHairstyles(query: HairstyleQuery = {}): Promise<Hairstyle[]> {
  assertMocks();
  // TODO(backend): GET /hairstyles?gender=&hairType=&category=&q=
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
  assertMocks();
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

/** Where a stage starts, and how far it may creep before the next one begins. */
const STAGE_RANGE: Record<TryOnStage, [number, number]> = {
  prepare: [0.02, 0.16],
  apply: [0.2, 0.9],
  finalize: [0.92, 0.99],
};

const STAGE_INDEX: Record<TryOnStage, number> = { prepare: 0, apply: 1, finalize: 2 };

/**
 * Generates one preview.
 *
 * Two paths behind one signature. With a fal key configured and a real photo to
 * work from it runs `generateTryOn` — the user's photo plus the catalog's own
 * renders of the chosen cut, edited by the model. Without either it runs the
 * original simulation, which is what keeps the sample-photo walkthrough and a
 * key-less checkout working end to end. `GeneratedLook.simulated` says which of
 * the two happened, so no screen has to guess.
 *
 * TODO(backend): both paths collapse into POST /looks { hairstyleId, hairType,
 * photo } plus a poll loop. The progress callback contract does not change; the
 * key stops living in the app.
 */
export function generateLook(
  request: GenerateRequest,
  onProgress: (update: GenerateProgress) => void,
): { promise: Promise<GeneratedLook>; cancel: () => void } {
  return canGenerateFor(request.photoUri)
    ? runRealGeneration(request, onProgress)
    : runSimulatedGeneration(request, onProgress);
}

function lookFrom(request: GenerateRequest, resultUri: string | null, simulated: boolean): GeneratedLook {
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

      // Pulled onto the device before the look is handed over: a look outlives
      // the url it arrived on, and "save to camera roll" needs a file.
      const resultUri = await cacheRemoteImage(outcome.imageUrl, `${request.hairstyle.id}-${Date.now()}.png`);
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
  assertMocks();

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
