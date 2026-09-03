/**
 * The on-demand generation path: this user's photo, wearing this haircut.
 *
 * The second of the two image-generation paths, and the only one that runs at
 * runtime. The catalog's mannequins are generated ahead of time by
 * `scripts/generate-mannequins.mjs` and shipped as assets; this one starts when
 * a user presses "Generate my preview" and it has a person's face in it, which
 * is why it lives in `src/api/` beside the client rather than in `scripts/`.
 *
 * What it sends is the whole idea of the feature: the model is never asked for
 * "a buzz cut". It is handed the user's photo and the catalog's own mannequin
 * render of the chosen cut — the same image the user just tapped — and told to
 * copy the haircut out of it and change nothing else. The hairstyle's name is a
 * caption on the reference, not the specification. See `src/lib/tryOnPrompt.ts`
 * for the instruction and `REFERENCE_VIEWS` below for why it is one image.
 *
 * SECURITY / TODO(backend): the fal key is read from `EXPO_PUBLIC_FAL_KEY`,
 * which means it is compiled into the app bundle and anyone with the app has it.
 * That is acceptable for a prototype on a key you can rotate and cap, and
 * nothing else. In phase 2 this module becomes a POST to the Railway API:
 * the app uploads the photo, the server holds the key, and the reference sheet
 * never moves at all because it already lives in the catalog's storage. The
 * signature below is written to survive that — `generateTryOn` takes a request
 * and reports stages, exactly as an API call with a poll loop would.
 */

import { firstImageUrl, runModel, type ImageResponse, type QueueStatus } from '@/api/fal';
import type { Gender, HairColor, HairTypeId, Hairstyle, VariantId } from '@/api/types';
import { assetDataUri, photoDataUri, photoPixelSize } from '@/lib/imageData';
import { fitOutputSize, type PixelSize } from '@/lib/imageSize';
import { DEMO_PHOTO } from '@/lib/constants';
import { variantCandidates } from '@/lib/hairTypes';
import { HERO_ANGLE, type ViewAngle } from '@/lib/hairShape';
import { mannequinViews } from '@/lib/mannequinRender';
import { tryOnPrompt } from '@/lib/tryOnPrompt';

/**
 * Which angles of the cut get sent, and why it is one of them.
 *
 * The first version sent all four, on the reasoning that more views of the same
 * haircut can only help the model build a consistent one. That is true of a
 * human and false of this model. With five images in the request it stopped
 * treating the photograph as the thing being edited and started *composing*
 * across the set: what came back was a studio portrait on the mannequin's own
 * grey ground, at the mannequin's crop and aspect ratio, wearing a stranger's
 * face. Four references outvoted one photograph, and they were right about
 * everything except the one thing they were sent for.
 *
 * Two images is the shape this request wants: here is a picture, here is a
 * haircut, put the second on the first. So the reference is the hero angle — the
 * three-quarter turn, which is the single most informative view of a cut (crown,
 * fringe, temple, ear and the start of the taper all read in it) and the image
 * on the catalog card the user actually tapped.
 *
 * What that costs is the back of the head: a nape or a fade's rear blend is
 * inferred rather than copied. The fix for that is a single reference image that
 * happens to contain four views — the composed `<gender>-sheet.png` the
 * generator already writes — which keeps the count at two. It is not wired up
 * because the sheets are 1.6MB masters that would have to be downscaled and
 * bundled; see the note in README. Do not solve it by adding images back.
 */
const REFERENCE_VIEWS: ViewAngle[] = [HERO_ANGLE];

/**
 * The key, and the switch.
 *
 * Expo only exposes `EXPO_PUBLIC_*` to the app, so this is a different variable
 * from the `FAL_KEY` the generator scripts read out of `.env.local` — same
 * account, different blast radius. With no key the app runs exactly as it did
 * before: `generateLook` falls back to the simulated preview rather than failing.
 */
const FAL_KEY = process.env.EXPO_PUBLIC_FAL_KEY ?? '';

/**
 * The edit model.
 *
 * `openai/gpt-image-2/edit`, at `quality: "medium"` — see `TRY_ON_QUALITY`,
 * which is half the decision and the half that used to be missing.
 *
 * This model was here before, was measured at about $0.20 a preview against
 * nano-banana-2's $0.08, and was sent back for costing 2.5x. That measurement
 * was of the *default* tier. gpt-image-2 prices by quality and by size, `high`
 * is the default, and nobody ever had to accept it: at `medium` and 1920×1088
 * the same request is about $0.053, which undercuts nano-banana-2 at 1K ($0.08)
 * and is well under half what this app was paying at 2K ($0.12). The old note
 * here read as though gpt-image were categorically the expensive option. It is
 * not; it is the expensive option at `high`.
 *
 * A second objection recorded here has simply expired. Output sizes were a fixed
 * set (1024², 1536×1024, 1024×1536), so an oddly-shaped photograph came back
 * resampled. `image_size` now defaults to `auto`, inferred from the input, and
 * takes concrete sizes on any multiple of 16 up to a 3840px edge.
 *
 * The third objection stands and is the one to watch: gpt-image re-renders the
 * whole frame rather than editing pixels in place, so "return the same
 * photograph otherwise" is approximated rather than exact, and identity drifts a
 * little on every generation. That is why the face paragraph exists in
 * `src/lib/tryOnPrompt.ts` and why it must not be deleted while this model is
 * the default. The real fix is `mask_url`, which this endpoint takes and
 * nano-banana has no equivalent of — confine the edit to the hair region and the
 * drift stops being a thing prose has to prevent. That needs hair segmentation
 * on the *user's* photo, which this app does not have yet: the masks in
 * `assets/mannequins/` are for catalog renders. It is the obvious next move.
 *
 * The known cost of leaving nano-banana-2 is that the reference image in the
 * request and the model reading it are no longer the same family: every render
 * in the catalog is shot on nano-banana. That was the argument for going back
 * last time. It is worth re-testing rather than assuming, which is what
 * `npm run try-on -- --model` is for.
 *
 * The variable is deliberately not the generators' `FAL_EDIT_MODEL`: one switch
 * moving both would re-point a generator whose model change means re-shooting
 * 103 renders.
 */
export const TRY_ON_MODEL = process.env.EXPO_PUBLIC_FAL_TRY_ON_MODEL ?? 'openai/gpt-image-2/edit';

/**
 * How hard the model works, and the whole reason this model is affordable.
 *
 * gpt-image-2 bills by tier: at 1920×1088 it is $0.017 low, $0.053 medium and
 * $0.158 high. `high` is the API default and is what the $0.20-a-preview
 * measurement in the note above was actually measuring. `low` is not a saving
 * worth having here — it is the same lost-detail failure `TRY_ON_RESOLUTION`
 * was raised to fix, bought back for four cents.
 */
export const TRY_ON_QUALITY = process.env.EXPO_PUBLIC_FAL_TRY_ON_QUALITY ?? 'medium';

/**
 * The output size, for the models that size by pixels.
 *
 * `match` — the photograph's own shape, measured per request, at a fixed pixel
 * budget. This is not a formatting nicety: the preview's whole job is to be
 * wiped against the original in `<BeforeAfter>`, both halves are drawn
 * `contentFit="cover"`, and cover crops two different aspects by two different
 * amounts. The head then sits at a different scale on each side of the wipe and
 * the generator gets blamed for zooming the photo, when all it did was return
 * the frame it was asked for. `src/lib/imageSize.ts` has the arithmetic and the
 * rest of the reasoning.
 *
 * It replaced a fixed 1920×1088, which was a landscape frame being handed
 * portrait selfies — the "came back resampled" failure named above, arrived at
 * by a different route. (1088, incidentally, not the 1920×1080 fal's pricing
 * table names its bucket after: 1080 is not a multiple of 16.)
 *
 * The other values still work and are one variable, no code:
 *
 *   EXPO_PUBLIC_FAL_TRY_ON_IMAGE_SIZE=auto        let the model infer it
 *   EXPO_PUBLIC_FAL_TRY_ON_IMAGE_SIZE=1024x1536   a fixed portrait frame
 *   EXPO_PUBLIC_FAL_TRY_ON_IMAGE_SIZE=            send no size at all
 *
 * `match` costs nothing extra: the budget is held at 1920×1088's pixel count, so
 * only the shape varies and the price tier does not.
 */
export const TRY_ON_IMAGE_SIZE = process.env.EXPO_PUBLIC_FAL_TRY_ON_IMAGE_SIZE ?? 'match';

/**
 * `match` resolves against this photograph; `WxH` becomes fal's object form;
 * anything else is a preset name and is passed through untouched.
 *
 * An unmeasurable photo under `match` returns null, which drops the field and
 * leaves the model on `auto`. That is the correct fallback rather than a guess:
 * `auto` infers from the input image, so it is aiming at the same target with
 * less precision.
 */
function imageSizeField(photo: PixelSize | null): PixelSize | string | null {
  const raw = TRY_ON_IMAGE_SIZE.trim();
  if (!raw) return null;
  if (raw === 'match') return fitOutputSize(photo);
  const size = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(raw);
  return size ? { width: Number(size[1]), height: Number(size[2]) } : raw;
}

/**
 * How big the preview comes back, and why it is no longer the default.
 *
 * nano-banana-2 generates at 1K unless it is asked otherwise, and this request
 * never asked. That cost more than it looked like it did. A haircut is carried
 * by strand-level detail — the stubble field of a fade, the separation at a
 * hairline, the strands that leave the mass — and in a 1K frame where the head
 * is only part of the picture, that detail lands under a pixel and is resolved
 * as a smooth mass instead. What arrives is hair that reads as moulded, which is
 * the same complaint the mannequin paragraph in `src/lib/tryOnPrompt.ts`
 * answers from the other side. Neither half is much use alone: no wording
 * recovers detail that was never rendered, and a sharper render still copies the
 * plastic if the prompt asks it to.
 *
 * 2K is 1.5x the base rate — $0.12 a preview against $0.08. 4K is 2x and is
 * spent on a phone screen; 0.5K exists and is the same bug, cheaper.
 *
 * `resolution` is nano-banana's own parameter: gpt-image-2 sizes by
 * `image_size` and flux bills by megapixel, so neither takes this name or these
 * values. It is therefore not sent unless a nano-banana model is selected — see
 * `modelOptions()` — and this constant is what that model gets when it is. The
 * default model is gpt-image-2 today, so this line is dormant rather than dead:
 * it is what `EXPO_PUBLIC_FAL_TRY_ON_MODEL=fal-ai/nano-banana-2/edit` comes
 * back to, and going back must not also mean rediscovering the 1K bug.
 */
export const TRY_ON_RESOLUTION = process.env.EXPO_PUBLIC_FAL_TRY_ON_RESOLUTION ?? '2K';

/**
 * The fields that are not shared between the two models.
 *
 * Everything else in the request — `prompt`, `image_urls`, `num_images`,
 * `output_format` — is identical for both, which is what makes the model a
 * one-line switch. Sizing is the exception and the names do not overlap at all,
 * so it is selected by model rather than sent hopefully and left to be ignored:
 * an unknown field is not reliably a no-op, and a request that fails schema
 * validation surfaces to the user as a failed generation.
 */
function modelOptions(model: string, photo: PixelSize | null): Record<string, unknown> {
  if (model.startsWith('openai/gpt-image')) {
    const imageSize = imageSizeField(photo);
    return {
      quality: TRY_ON_QUALITY,
      ...(imageSize ? { image_size: imageSize } : {}),
    };
  }
  // nano-banana has no equivalent: `resolution` picks a tier, not a shape, and
  // the model keeps the input's aspect on its own.
  return TRY_ON_RESOLUTION ? { resolution: TRY_ON_RESOLUTION } : {};
}

/**
 * Whether a real preview can be generated at all.
 *
 * Not a question about this particular try-on — that is `canGenerateFor()`
 * below. This is the app-wide "is generation configured", which the copy on the
 * result screen reads so it can stop calling a real image a simulation.
 */
export const generationConfigured = (): boolean => FAL_KEY.length > 0;

/**
 * Whether *this* try-on can be generated for real.
 *
 * The sample photo cannot: there is no photo behind it. It is a sentinel that
 * makes `<PhotoFrame>` draw the procedural mannequin, so there are no pixels to
 * send and nothing to preserve, and that path stays simulated.
 *
 * Platform is not part of the question even though it could be. fal's queue
 * expects a server-side caller and a browser may be refused by CORS, but a
 * refusal is a real failure with a retry behind it, and quietly showing a web
 * user a simulation labelled as a preview would be worse than the error.
 */
export const canGenerateFor = (photoUri: string | null | undefined): boolean =>
  generationConfigured() && !!photoUri && photoUri !== DEMO_PHOTO;

/** Where a running generation has got to — mapped onto `GENERATION_STEPS`. */
export type TryOnStage = 'prepare' | 'apply' | 'finalize';

export interface TryOnRequest {
  hairstyle: Hairstyle;
  gender: Gender;
  /** The user's declared hair type, or null for "All Types". */
  hairType: HairTypeId | null;
  photoUri: string;
  /** The shade to render the hair in, or null to keep the subject's own. */
  color: HairColor | null;
}

export interface TryOnOutcome {
  /** The generated image. A fal url today, a Railway one once there is a server. */
  imageUrl: string;
  /** Which angles of the cut the model was actually shown. */
  views: ViewAngle[];
}

export interface TryOnHandlers {
  onStage?: (stage: TryOnStage) => void;
  signal?: AbortSignal;
}

/**
 * Why a preview will use a render of the wrong hair type, when the app never
 * would.
 *
 * `variantCandidates()` is strict on purpose: a declared hair type matches its
 * variant exactly or falls through to the procedural drawing, because showing
 * someone the curly render of a cut they asked to see straight is a wrong image
 * rather than a partial one. That rule is about what goes *on screen*, and it
 * stays.
 *
 * Applied to the generator's reference it produced a much worse outcome. The
 * catalog was shot curly and is part-way through coily, so 44 of the 99 male
 * style × hair-type combinations have no render for the declared type — every
 * straight and wavy user, on almost every cut. Those previews were falling
 * through to the name-only prompt, which against four paragraphs of "keep the
 * photograph exactly the same" reliably returns the photograph exactly the same.
 * The user asks for a mid fade and nothing happens.
 *
 * The reference is not on screen, though, and it is not doing the same job. It
 * supplies *geometry* — where the fade starts, how long the top is, how the
 * outline sits on the skull — and geometry is the part of a cut that survives a
 * change of texture. The texture itself is supplied separately and in words, by
 * `hairTypeLine`, which names the user's real type; and when the two disagree
 * the prompt says so outright rather than leaving the model to average them.
 *
 * So: the right variant when it exists, any variant of the same cut when it
 * does not, and nothing only when the cut has never been generated at all. That
 * closes 43 of the 44.
 */
function resolveReference(
  hairstyle: Hairstyle,
  gender: Gender,
  hairType: HairTypeId | null,
): { variant: VariantId; views: { angle: ViewAngle; source: number }[] } | null {
  return (
    mannequinViews(hairstyle.id, gender, variantCandidates(hairstyle, hairType)) ??
    mannequinViews(hairstyle.id, gender, null)
  );
}

/**
 * Runs one preview to completion.
 *
 * Reads as three stages because that is what the user is shown, and they are
 * three genuinely different waits: reading two or three megabytes of image off
 * the device, the model's own queue, and pulling the result back.
 */
export async function generateTryOn(
  request: TryOnRequest,
  { onStage, signal }: TryOnHandlers = {},
): Promise<TryOnOutcome> {
  if (!FAL_KEY) throw new Error('EXPO_PUBLIC_FAL_KEY is not set');

  onStage?.('prepare');
  const { hairstyle, gender, hairType, photoUri, color } = request;

  const reference = resolveReference(hairstyle, gender, hairType);

  // Narrowed *after* resolution rather than during it: the variant is chosen by
  // what exists at all, and only then is the request trimmed to the angles it
  // should carry. A style whose hero angle is missing sends nothing rather than
  // silently reaching for a different variant's.
  const views = (reference?.views ?? []).filter((view) => REFERENCE_VIEWS.includes(view.angle));

  // Measured next to the encode rather than after it: both read the same file
  // and the size is wanted before the request is built. Nested so the encodes
  // keep their tuple type and the measurement — which resolves to null rather
  // than rejecting — cannot take the generation down with it.
  const [[photo, ...referenceImages], photoSize] = await Promise.all([
    Promise.all([photoDataUri(photoUri), ...views.map((view) => assetDataUri(view.source))]),
    photoPixelSize(photoUri),
  ]);

  const prompt = tryOnPrompt({
    hairstyle,
    gender,
    hairType,
    variant: reference?.variant ?? null,
    views: views.map((view) => view.angle),
    color,
  });

  if (__DEV__) {
    const angles = views.map((view) => view.angle).join(', ') || 'none';
    // The stand-in case is called out because it is the one that used to fail
    // silently, and because a preview that came back unchanged needs this line
    // to be told apart from a preview that was never generated at all.
    const declared = hairType ? hairstyle.variants[hairType] : null;
    const standIn = reference && declared && reference.variant !== declared ? ` (stand-in for ${declared})` : '';
    const asked = modelOptions(TRY_ON_MODEL, photoSize).image_size;
    const size =
      asked && typeof asked === 'object'
        ? `${(asked as PixelSize).width}x${(asked as PixelSize).height}`
        : (asked ?? 'model default');
    const source = photoSize ? `${photoSize.width}x${photoSize.height}` : 'unmeasured';
    console.log(
      `[try-on] ${hairstyle.id} — reference ${reference?.variant ?? 'NONE'}${standIn}, views: ${angles}, photo ${source} -> ${size}`,
    );
  }

  onStage?.('apply');
  const result = await runModel<ImageResponse>(
    TRY_ON_MODEL,
    {
      prompt,
      // The photo first: it is the image being edited, and everything after it
      // is reference the prompt names by view rather than by position.
      image_urls: [photo, ...referenceImages],
      num_images: 1,
      output_format: 'png',
      // Sizing, named the way the selected model names it — see `modelOptions`.
      ...modelOptions(TRY_ON_MODEL, photoSize),
    },
    {
      key: FAL_KEY,
      signal,
      onStatus: (status: QueueStatus) => {
        if (status === 'COMPLETED') onStage?.('finalize');
      },
    },
  );

  return { imageUrl: firstImageUrl(result), views: views.map((view) => view.angle) };
}
