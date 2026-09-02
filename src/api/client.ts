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

import { mockCatalog } from './mockCatalog';
import type {
  Adjustment,
  Catalog,
  Category,
  GeneratedLook,
  GenerationStep,
  Gender,
  HairColor,
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

export interface HairstyleQuery {
  gender?: Gender | null;
  categoryId?: string | null;
  search?: string | null;
  tag?: string | null;
  limit?: number;
}

export async function fetchHairstyles(query: HairstyleQuery = {}): Promise<Hairstyle[]> {
  assertMocks();
  // TODO(backend): GET /hairstyles?gender=&category=&q=
  await networkDelay();
  return filterHairstyles(mockCatalog.hairstyles, query);
}

/** Pure filter, exported so screens can re-filter a cached catalog without a round trip. */
export function filterHairstyles(source: Hairstyle[], query: HairstyleQuery): Hairstyle[] {
  const { gender, categoryId, search, tag, limit } = query;
  const needle = search?.trim().toLowerCase() ?? '';

  const result = source
    .filter((style) => (gender ? style.genders.includes(gender) : true))
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
    .sort((a, b) => b.popularity - a.popularity);

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
): Hairstyle[] {
  const seed = source.find((style) => style.id === styleId);
  if (!seed) return source.slice(0, limit);

  return source
    .filter((style) => style.id !== styleId)
    .filter((style) => (gender ? style.genders.includes(gender) : true))
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

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

const LENGTH_OPTIONS = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
];

const FADE_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'mid', label: 'Mid' },
  { id: 'high', label: 'High' },
];

/**
 * The Customize screen renders whatever this returns — it has no knowledge of
 * which controls exist for which style. Later this becomes part of the
 * hairstyle record served by the API.
 */
export function adjustmentsFor(style: Hairstyle): Adjustment[] {
  const defs: Adjustment[] = [];

  if (style.adjustments.includes('length')) {
    defs.push({
      id: 'length',
      kind: 'choice',
      label: 'Hair length',
      hint: 'How much length is left after the cut',
      options: LENGTH_OPTIONS,
      defaultValue: style.shape.top > 0.55 ? 'long' : style.shape.top > 0.28 ? 'medium' : 'short',
    });
  }

  if (style.adjustments.includes('fade')) {
    defs.push({
      id: 'fade',
      kind: 'choice',
      label: 'Fade level',
      hint: 'How high the fade climbs the side',
      options: FADE_OPTIONS,
      defaultValue: style.shape.sides < 0.08 ? 'high' : style.shape.sides < 0.16 ? 'low' : 'none',
    });
  }

  if (style.adjustments.includes('color')) {
    defs.push({
      id: 'color',
      kind: 'color',
      label: 'Hair colour',
      hint: 'Tap a shade to preview it',
      defaultValue: style.defaultColorId,
    });
  }

  return defs;
}

export function defaultOptionsFor(style: Hairstyle): TryOnOptions {
  const options: TryOnOptions = {};
  for (const adjustment of adjustmentsFor(style)) {
    if (adjustment.id === 'color') options.color = adjustment.defaultValue;
    else if (adjustment.id === 'length') options.length = adjustment.defaultValue;
    else if (adjustment.id === 'fade') options.fade = adjustment.defaultValue;
  }
  return options;
}

export function colorById(colors: HairColor[], id: string | undefined): HairColor | undefined {
  return colors.find((color) => color.id === id);
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
