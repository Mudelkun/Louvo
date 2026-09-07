/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Copied from `server/src/types.ts` by `web/scripts/sync-contract.mjs`, with only
 * its import header re-pointed. Edit the source and re-run `npm run sync`.
 */

/**
 * The catalog's wire shape.
 *
 * A deliberate mirror of `src/api/types.ts` in the app, in the same way
 * `scripts/lib/variants.mjs` mirrors `src/lib/hairTypes.ts`: the server and the
 * app are separate programs and the server must not reach into the app's source
 * tree. What binds them is that this file *is* the contract — `GET /v1/catalog`
 * returns a `CatalogResponse` and `CatalogProvider` reads it as a `Catalog`, so
 * a change here without the matching change there is a broken client.
 *
 * The two are kept honest by `npm run typecheck` on each side plus the shape
 * assertion in `src/catalog.ts`, not by sharing a module. If they ever need to
 * be shared for real, the move is a published package — not an import across the
 * directory boundary.
 */

export type Gender = 'male' | 'female';

export type HairTypeId = 'straight' | 'wavy' | 'curly' | 'coily';

/** `any` is the single render that serves every hair type. */
export type VariantId = 'any' | HairTypeId;

export type HairLengthId = 'short' | 'medium' | 'long';

export type ViewAngle = 'front' | 'half' | 'side' | 'back';

export type TextureKind = 'straight' | 'wavy' | 'curly' | 'coily' | 'spiky';

export const GENDERS: Gender[] = ['male', 'female'];
export const HAIR_TYPE_IDS: HairTypeId[] = ['straight', 'wavy', 'curly', 'coily'];
export const VARIANT_IDS: VariantId[] = ['any', 'straight', 'wavy', 'curly', 'coily'];
export const HAIR_LENGTH_IDS: HairLengthId[] = ['short', 'medium', 'long'];
export const VIEW_ANGLES: ViewAngle[] = ['front', 'half', 'side', 'back'];

/** The cut as the catalog shot it. See `HairLengthOffer` in the app's types. */
export const ANCHOR_LENGTH: HairLengthId = 'medium';

/**
 * Which render to show for each hair type. `null` means the style is not offered
 * for that type at all, and every key is always present — the app indexes it
 * directly.
 */
export type HairTypeVariants = Record<HairTypeId, VariantId | null>;

export type HairLengthOffer = Partial<Record<Gender, HairLengthId[]>>;

export interface HairShape {
  top: number;
  sides: number;
  back: number;
  fringe: number;
  texture: TextureKind;
  part?: 'none' | 'side' | 'middle';
  knot?: boolean;
  tail?: boolean;
}

export interface Category {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  genders: Gender[];
  order: number;
}

export interface HairType {
  id: HairTypeId;
  tier: string;
  name: string;
  description: string;
  icon: string;
  order: number;
}

export interface HairLength {
  id: HairLengthId;
  name: string;
  description: string;
  order: number;
}

export interface HairColor {
  id: string;
  name: string;
  hex: string;
  shade: string;
}

export type AdjustmentId = 'length' | 'fade' | 'color';

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
  adjustments: AdjustmentId[];
  variants: HairTypeVariants;
  lengths?: HairLengthOffer;
  shape: HairShape;
  imageUrl?: string | null;
}

/**
 * One render slot, as the app receives it.
 *
 * Both URLs are absolute and content-addressed, so they may be cached forever —
 * see `docs/catalog-architecture.md`. `maskUrl` is null when a mask could not be
 * computed for that render, which the app already handles by grading the whole
 * frame instead of the hair alone.
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
 * The same nesting the app's generated module uses, so installing this as the
 * runtime render index is a swap rather than a translation. Measured at 908
 * slots: about 92 KB raw, 36 KB gzipped.
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
 * The same nesting `hairTypeExamples.generated.ts` uses in the app, so the
 * catalog's copy installs over the bundled one as a swap rather than a
 * translation — the trick `RenderManifest` plays one level up.
 *
 * No masks and no dimensions: these are never colour-graded, so nothing needs to
 * be held to a region, and the picker lays them out at a fixed tile size.
 */
export type HairTypeExampleMap = Partial<Record<Gender, Partial<Record<HairTypeId, string>>>>;

export interface CatalogResponse {
  categories: Category[];
  hairTypes: HairType[];
  hairLengths: HairLength[];
  hairstyles: Hairstyle[];
  colors: HairColor[];
  highlights: string[];
  /**
   * The imagery. Absent from the app's own `Catalog` type until this branch —
   * where the app used to read a bundled `require()` map, it now installs this.
   */
  renders: RenderManifest;
  /**
   * The hair-type picker's imagery.
   *
   * All four types for a gender or none of them: the picker shows a partial set
   * as no set at all, because two photographed rows above two icon rows reads as
   * a broken screen. `toHairTypeExamples` enforces that here so the app does not
   * have to guess.
   */
  hairTypeExamples: HairTypeExampleMap;
  /** Bumped by every publish; the ETag is derived from it. */
  revision: number;
}
