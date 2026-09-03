/**
 * Domain types.
 *
 * These mirror the shape of the future Railway/Node API responses exactly, so the
 * mock client in `mockClient.ts` can be swapped for `fetch` calls without any
 * screen changing. Nothing in the UI may hardcode a hairstyle: screens receive
 * catalog data at runtime and reference styles by id only.
 */

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

export interface Catalog {
  categories: Category[];
  hairTypes: HairType[];
  hairstyles: Hairstyle[];
  colors: HairColor[];
  /** Server-driven copy for the "why you'll love it" panel on the welcome screen. */
  highlights: string[];
}
