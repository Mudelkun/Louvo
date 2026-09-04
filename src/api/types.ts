/**
 * Domain types.
 *
 * These are the shape of the Railway/Node API's responses — `server/src/types.ts`
 * is the deliberate mirror on the other side, in the same way
 * `scripts/lib/variants.mjs` mirrors `src/lib/hairTypes.ts`. Nothing in the UI
 * may hardcode a hairstyle: screens receive catalog data at runtime and
 * reference styles by id only.
 */

import type { ViewAngle } from '@/lib/hairShape';

export type Gender = 'male' | 'female';

export type TextureKind = 'straight' | 'wavy' | 'curly' | 'coily' | 'spiky';

/**
 * The four hair types, the catalog's primary dimension alongside gender.
 *
 * This is what the user *has*, not what a hairstyle *is*: it is chosen once,
 * before browsing, and it decides both which hairstyles are offered and which
 * render of each one is shown. `null` anywhere a `HairTypeId` is expected means
 * "All Types" — the user browsing without declaring one.
 */
export type HairTypeId = 'straight' | 'wavy' | 'curly' | 'coily';

/**
 * One generated render of a hairstyle.
 *
 * Not one per hair type: a hairstyle is only shot again for a type whose
 * texture actually changes how the cut looks. `any` is the id of the single
 * render that serves every type, used for cuts too short, too set or too
 * constructed for the natural texture to read at all — a buzz cut, a
 * flat-ironed blowout, box braids.
 */
export type VariantId = 'any' | HairTypeId;

/**
 * The hairstyle x hair type matrix, one row.
 *
 * Every type maps to the variant that should be *shown* for it, which is how
 * one render can serve several types: `{ straight: 'straight', wavy:
 * 'straight', curly: 'curly', coily: 'coily' }` is a cut whose wavy version is
 * indistinguishable from its straight one, so three renders cover four types.
 * `null` means the hairstyle is not offered for that type at all — an afro on
 * type 1 hair is not a haircut, it is a different head of hair.
 */
export type HairTypeVariants = Record<HairTypeId, VariantId | null>;

/**
 * How long the cut is worn, where that is a choice the user gets to make.
 *
 * Not a second hair type. Hair type is something the user *has* and declares
 * once before browsing; length is something they *do* to a cut they have
 * already picked, on the style screen, and it applies to one style at a time.
 * That is why it is a list of offered positions rather than a
 * `Record<HairLengthId, ...>` mapping the way `HairTypeVariants` is: there is
 * nothing to look the user's answer up against, because the answer does not
 * exist until they move the slider.
 *
 * `medium` is not the middle of a scale — it is the anchor. Every render in the
 * catalog was shot before length existed, from a prompt that says nothing about
 * it, so what is on disk is the cut *as the catalog authored it*, and that is
 * what `medium` names. `short` and `long` are departures from it in either
 * direction. See `HairLengthOffer` for why every offered range has to contain
 * it.
 */
export type HairLengthId = 'short' | 'medium' | 'long';

/**
 * A length as catalog data, so the slider is server-driven like the hair-type
 * control beside it. Ordered short to long — the order is the slider.
 */
export interface HairLength {
  id: HairLengthId;
  /** "Short". */
  name: string;
  /** One line describing what this position does to a cut. */
  description: string;
  order: number;
}

/**
 * Which lengths a hairstyle is offered at, per gender.
 *
 * Per gender because the judgement differs by gender for the same record: a
 * men's Wolf Cut and a women's Wolf Cut do not travel the same distance, and a
 * cut offered to both with one shared row would give one of them a slider
 * position nobody would shoot. Absent, or fewer than two entries, means this
 * cut has no length choice and no slider appears — which is most of the
 * catalog, and deliberately so. A fade's variable is its fade height, not its
 * length; a Caesar cut that got longer would stop being one.
 *
 * **Every range must contain `medium`.** That is a real constraint, not a
 * convention: `medium` is what the render already on disk depicts, so a range
 * without it would open the screen on a length the catalog has never shot and
 * make the untouched slider a claim the imagery cannot back. `short`/`medium`
 * and `medium`/`long` are the two-step ranges for cuts that only travel one way
 * — a Pixie Cut grown out is a bob, so it goes short and stops.
 *
 * Like `HairTypeVariants`, this is data rather than a rule in the app: whether
 * a cut survives being lengthened is a judgement about that haircut, and the
 * only place it belongs is beside the haircut.
 */
export type HairLengthOffer = Partial<Record<Gender, HairLengthId[]>>;

/**
 * A hair type as catalog data, so the picker is server-driven like everything
 * else. Ordered `straight, wavy, curly, coily` — types 1 to 4.
 */
export interface HairType {
  id: HairTypeId;
  /** "Type 1" — the number people recognise from the typing system. */
  tier: string;
  /** "Straight". */
  name: string;
  /** One line describing the pattern, shown under the name. */
  description: string;
  /** Ionicons glyph name — chosen by the backend so hair types stay data. */
  icon: string;
  order: number;
}

/**
 * Procedural description of a hairstyle silhouette, used to draw the neutral
 * faceless mannequin locally while the AI-generated catalog imagery does not
 * exist yet. When the backend starts serving real mannequin renders, each
 * hairstyle gains `imageUrl` and the renderer prefers it over this descriptor.
 */
export interface HairShape {
  /** Volume above the crown, 0 (shaved) .. 1 (tall pompadour / afro). */
  top: number;
  /** Length of the sides, 0 (skin fade) .. 1 (full curtain). */
  sides: number;
  /** Length falling behind the head, 0 (none) .. 1 (waist length). */
  back: number;
  /** How far the hairline dips over the forehead, 0 (swept back) .. 1 (heavy fringe). */
  fringe: number;
  texture: TextureKind;
  /** Draws a visible parting. */
  part?: 'none' | 'side' | 'middle';
  /** Draws a bun / knot at the crown. */
  knot?: boolean;
  /** Draws a gathered tail instead of loose length. */
  tail?: boolean;
}

export interface Category {
  id: string;
  name: string;
  tagline: string;
  /** Ionicons glyph name — chosen by the backend so categories stay data. */
  icon: string;
  genders: Gender[];
  order: number;
}

/**
 * A shade the user can put any hairstyle in.
 *
 * Colour is not a property of a hairstyle and never was one worth generating per
 * style: the catalog is rendered once in `BASE_HAIR_COLOR` and the app grades
 * that render to whichever of these the user picks (`src/lib/colorGrade.ts`).
 * Adding a colour is therefore a row here, not a re-shoot of the catalog.
 */
export interface HairColor {
  id: string;
  name: string;
  hex: string;
  /** Darker shade used for the mannequin's under-layer shading. */
  shade: string;
}

export type AdjustmentId = 'length' | 'fade' | 'color';

export type Adjustment =
  | {
      id: Exclude<AdjustmentId, 'color'>;
      kind: 'choice';
      label: string;
      hint?: string;
      options: { id: string; label: string }[];
      defaultValue: string;
    }
  | {
      id: 'color';
      kind: 'color';
      label: string;
      hint?: string;
      defaultValue: string;
    };

export interface Hairstyle {
  id: string;
  name: string;
  categoryIds: string[];
  genders: Gender[];
  tags: string[];
  description: string;
  maintenance: 'Low' | 'Medium' | 'High';
  bestFor: string[];
  popularity: number;
  /** Which adjustments this style exposes on the Customize screen. */
  adjustments: AdjustmentId[];
  /**
   * Which render to show for each hair type, and which types this style is
   * offered for at all. See `HairTypeVariants` — this row *is* the catalog's
   * hairstyle x hair type matrix, which is why it is data rather than a rule
   * in the app: whether a curly textured crop needs its own shot is a judgement
   * about that haircut, and the only place it belongs is beside the haircut.
   */
  variants: HairTypeVariants;
  /**
   * Which lengths this cut is offered at, per gender — the slider on the style
   * screen. Absent on most styles: see `HairLengthOffer`.
   */
  lengths?: HairLengthOffer;
  shape: HairShape;
  /** Populated later by the backend with the AI-generated mannequin render. */
  imageUrl?: string | null;
}

/** The user's in-progress choices for one try-on. */
export interface TryOnOptions {
  length?: string;
  fade?: string;
  color?: string;
}

export interface GenerationStep {
  id: string;
  label: string;
}

export interface GeneratedLook {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
  gender: Gender;
  /**
   * The hair type the look was generated for, or null when the user browsed
   * "All Types". Sits beside `gender` rather than in `options` on purpose: it
   * describes the subject, not an adjustment made to the cut, and a saved look
   * has to keep the type it was made for after the session has moved on.
   */
  hairType: HairTypeId | null;
  /** The user's original photo (local uri in the prototype). */
  sourcePhotoUri: string | null;
  /** The generated result — a local file once one has been generated. */
  resultUri: string | null;
  options: TryOnOptions;
  createdAt: number;
  /**
   * Whether this look was drawn by the simulation rather than generated.
   *
   * A simulated look's `resultUri` *is* its `sourcePhotoUri`: nothing was
   * generated, the flow was walked through. It happens on the sample photo,
   * which has no pixels behind it, and with no generator key configured.
   *
   * It is stored on the look rather than worked out from the two uris being
   * equal, because a screen asking "is this a real preview" is asking a question
   * about how the look was made, and a saved look has to keep that answer.
   */
  simulated: boolean;
}

/**
 * A preview that is generating in the background.
 *
 * The user does not wait on a generation screen: the job is queued, the app
 * returns to My looks, and the tile there shows progress until the look lands
 * in the library and a notification is raised.
 */
export interface LookJob {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
  gender: Gender;
  /** As on `GeneratedLook` — the type the preview is being generated for. */
  hairType: HairTypeId | null;
  sourcePhotoUri: string | null;
  options: TryOnOptions;
  createdAt: number;
  status: 'processing' | 'failed';
  /**
   * The backend's id for this job, when the backend is running it.
   *
   * Present exactly when generation is a server job (`generationSource()` is
   * `server`). It is what lets a job survive the app being closed: everything
   * else on this record is a local copy of state the server owns, and this is
   * the handle to go and re-read it. Absent on the direct and simulated paths,
   * where the job is a promise in memory and dies with the process.
   */
  remoteId?: string;
  /**
   * How many generations are ahead of this one, when it is waiting.
   *
   * The account's concurrency limit is small, so a busy minute is a real wait,
   * and this is the only honest thing the app can say about it. Absent once the
   * job is actually generating — a position in a queue it has left would be a
   * number that means nothing.
   */
  queuePosition?: number;
  /** 0..1 */
  progress: number;
  /**
   * Which of `GENERATION_STEPS` the job is in.
   *
   * The generator has always reported this and the job has always dropped it,
   * which left every waiting surface with nothing to say but "Processing…" over
   * a bar. A percentage answers *how far*; only this answers *what is
   * happening*, and the second is what makes a wait read as work being done
   * rather than as a stall.
   */
  stepIndex: number;
  /**
   * Why a failed job failed, short enough for the tile.
   *
   * Generation is a real network round trip now, so "it failed" is no longer the
   * whole story: a rejected key, a dropped connection and a model that returned
   * nothing all need different things from the user, and only one of them is
   * worth pressing Retry on.
   */
  error?: string;
}

/**
 * One hosted render of one hairstyle, as the API serves it.
 *
 * Both URLs are absolute and their path is a content hash, so they never change
 * meaning and may be cached for as long as the device likes — see
 * `docs/catalog-architecture.md`. `maskUrl` is null when a hair mask could not
 * be computed for that render, which `<Mannequin>` already handles by grading
 * the whole frame instead of the hair alone.
 */
export interface RenderRef {
  url: string;
  maskUrl: string | null;
  width: number;
  height: number;
}

/**
 * Every render the catalog has, keyed
 * `styleId -> variant -> length -> gender -> angle`.
 *
 * Exactly the nesting `mannequinRenders.generated.ts` uses, which is what makes
 * installing this as the runtime render index a swap rather than a translation
 * (`src/api/renderIndex.ts`). The bundled module exists because Metro can only
 * bundle an asset some module `require`s by a literal path; a URL has no such
 * constraint, so the map becomes data.
 */
export type RenderManifest = Record<
  string,
  Partial<
    Record<
      VariantId,
      Partial<Record<HairLengthId, Partial<Record<Gender, Partial<Record<ViewAngle, RenderRef>>>>>>
    >
  >
>;

/**
 * The hair-type picker's example images, keyed `gender -> hair type`.
 *
 * Exactly the nesting `hairTypeExamples.generated.ts` uses, so the catalog's
 * copy installs over the bundled one as a swap — the same trick `RenderManifest`
 * plays for the mannequins.
 *
 * These are not catalog imagery and never carry a mask: they illustrate what
 * hair *does*, and a texture has no shade to be graded into. The server sends a
 * gender only when all four of its types are present, because the picker shows a
 * partial set as no set at all.
 */
export type HairTypeExampleMap = Partial<Record<Gender, Partial<Record<HairTypeId, string>>>>;

export interface Catalog {
  categories: Category[];
  hairTypes: HairType[];
  /** The length positions the slider can offer, short to long. */
  hairLengths: HairLength[];
  hairstyles: Hairstyle[];
  colors: HairColor[];
  /** Server-driven copy for the "why you'll love it" panel on the welcome screen. */
  highlights: string[];
  /**
   * The catalog's imagery.
   *
   * Optional because the app still runs with no server: without one, the
   * bundled render module stands in and this is absent. Present, it is
   * installed as the render index and the bundle is not consulted at all.
   */
  renders?: RenderManifest;
  /**
   * The hair-type picker's imagery. Optional for the same reason `renders` is:
   * without a server the bundled examples stand in.
   */
  hairTypeExamples?: HairTypeExampleMap;
  /** Bumped by every publish. Used as the cache key, never shown. */
  revision?: number;
}
