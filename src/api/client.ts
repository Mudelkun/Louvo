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

import { mockCatalog } from './mockCatalog';
import type {
  Catalog,
  Category,
  GeneratedLook,
  GenerationStep,
  Gender,
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
// Preview generation (simulated)
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
}

export interface GenerateProgress {
  /** 0..1 */
  progress: number;
  stepIndex: number;
}

/**
 * Simulates the Fal.ai round trip: ~6 seconds of stepped progress, then returns
 * a look whose `resultUri` is the user's own photo (image generation is phase 3).
 *
 * TODO(backend): POST /looks { hairstyleId, options, photo } and poll the job
 * until it resolves to a generated image URL. The progress callback contract
 * stays the same.
 */
export function generateLook(
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
        resolve({
          id: `look_${Date.now().toString(36)}`,
          hairstyleId: request.hairstyle.id,
          hairstyleName: request.hairstyle.name,
          gender: request.gender,
          hairType: request.hairType,
          sourcePhotoUri: request.photoUri,
          resultUri: request.photoUri,
          options: request.options,
          createdAt: Date.now(),
        });
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
