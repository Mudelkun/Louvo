/**
 * Building the generation request, server side.
 *
 * The mirror of `src/api/tryOn.ts` minus everything that was only there because
 * the app was making the call itself: no key in a bundle, no base64 encoding of
 * a bundled PNG, no poll loop, no cancellation token. What is left is the part
 * that was always the actual design — *the model is shown the haircut, never
 * told it* — and it is unchanged, because it is the feature.
 *
 * Two things travel as urls now instead of as bytes:
 *
 * - **The reference** is already a public CDN object in the catalog this same
 *   process serves, so the request names it and fal fetches it. That is ~550 KB
 *   of base64 removed from every preview, off a phone's uplink, for an image
 *   identical for every user who taps that card.
 * - **The photograph** is a presigned `GET` against the private transient
 *   bucket, minted here and valid for minutes. It is the one moment the photo is
 *   readable by anything other than the device, it is unguessable, and the
 *   object is deleted the moment the job settles.
 *
 * The prompt itself is not written here and must not be. `generated/tryOnPrompt.ts`
 * is a mechanical copy of the authored `src/lib/tryOnPrompt.ts`, kept current by
 * `npm run sync:shared` and enforced by `npm run check` — see the header on
 * `scripts/sync-shared.mjs` for why this one crossing is a copy rather than a
 * hand-written mirror.
 */

import { env } from './env.js';
import { fitOutputSize, type PixelSize } from './generated/imageSize.js';
import { tryOnPrompt } from './generated/tryOnPrompt.js';
import type { JobRow } from './jobs.js';
import { referenceViews, resolveReference } from './reference.js';
import type { CatalogResponse, HairColor, VariantId, ViewAngle } from './types.js';

export interface BuiltRequest {
  model: string;
  input: Record<string, unknown>;
  variant: VariantId | null;
  views: ViewAngle[];
}

/**
 * `match` resolves against this photograph; `WxH` becomes fal's object form;
 * anything else is a preset name and passes through untouched.
 *
 * Mirrors `imageSizeField` in `src/api/tryOn.ts`, including the null case: an
 * unmeasurable photo drops the field and leaves the model on `auto`, which is
 * aiming at the same target with less precision rather than guessing a shape.
 */
function imageSizeField(photo: PixelSize | null): PixelSize | string | null {
  const raw = env.previews.imageSize.trim();
  if (!raw) return null;
  if (raw === 'match') return fitOutputSize(photo);
  const size = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(raw);
  return size ? { width: Number(size[1]), height: Number(size[2]) } : raw;
}

/**
 * The fields that are not shared between models.
 *
 * Selected by model rather than sent hopefully and left to be ignored: an
 * unknown field is not reliably a no-op, and a request that fails schema
 * validation reaches the user as a failed generation. Same reasoning, same shape
 * as the app's.
 */
function modelOptions(model: string, photo: PixelSize | null): Record<string, unknown> {
  if (model.startsWith('openai/gpt-image')) {
    const imageSize = imageSizeField(photo);
    return { quality: env.previews.quality, ...(imageSize ? { image_size: imageSize } : {}) };
  }
  return env.previews.resolution ? { resolution: env.previews.resolution } : {};
}

export interface BuildInput {
  catalog: CatalogResponse;
  job: JobRow;
  /** A signed url the model may read the photograph from, for a few minutes. */
  photoUrl: string;
}

/**
 * One job to one fal request, or an error naming what the catalog is missing.
 *
 * A hairstyle that has been unpublished between submit and claim is the real
 * case here — the queue can be an hour deep and a publish takes seconds — and it
 * has to be a clean failure with a reason rather than an exception carrying a
 * stack trace into a job tile.
 */
export function buildRequest({ catalog, job, photoUrl }: BuildInput): BuiltRequest {
  const hairstyle = catalog.hairstyles.find((style) => style.id === job.hairstyle_id);
  if (!hairstyle) throw new Error(`no hairstyle "${job.hairstyle_id}" in the published catalog`);

  const reference = resolveReference(
    catalog,
    hairstyle,
    job.gender,
    job.hair_type,
    job.length_id ?? undefined,
  );
  const views = referenceViews(reference);

  const photo: PixelSize | null =
    job.photo_width && job.photo_height ? { width: job.photo_width, height: job.photo_height } : null;

  // Colour is normally null and that is the honest default: the catalog's shade
  // is a studio convention and the session's `colorId` is a *display* setting,
  // so neither is a statement about this person's hair. The column exists as the
  // seam for the day a picker puts a real choice behind it.
  const color: HairColor | null = job.color_id
    ? (catalog.colors.find((entry) => entry.id === job.color_id) ?? null)
    : null;

  const prompt = tryOnPrompt({
    hairstyle,
    gender: job.gender,
    hairType: job.hair_type,
    variant: reference?.variant ?? null,
    views: views.map((view) => view.angle),
    color,
  });

  return {
    model: env.previews.model,
    variant: reference?.variant ?? null,
    views: views.map((view) => view.angle),
    input: {
      prompt,
      // The photo first: it is the image being edited, and everything after it
      // is reference the prompt names by position.
      image_urls: [photoUrl, ...views.map((view) => view.url)],
      num_images: 1,
      output_format: 'png',
      ...modelOptions(env.previews.model, photo),
    },
  };
}
