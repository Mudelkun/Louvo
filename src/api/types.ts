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
  /** The user's original photo (local uri in the prototype). */
  sourcePhotoUri: string | null;
  /** The generated result. Null while image generation is not wired up yet. */
  resultUri: string | null;
  options: TryOnOptions;
  createdAt: number;
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
  sourcePhotoUri: string | null;
  options: TryOnOptions;
  createdAt: number;
  status: 'processing' | 'failed';
  /** 0..1 */
  progress: number;
}

export interface Catalog {
  categories: Category[];
  hairstyles: Hairstyle[];
  colors: HairColor[];
  /** Server-driven copy for the "why you'll love it" panel on the welcome screen. */
  highlights: string[];
}
