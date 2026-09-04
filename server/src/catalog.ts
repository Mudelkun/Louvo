/**
 * Building the catalog payload.
 *
 * Nine small selects assembled in JavaScript rather than one clever query with
 * `json_agg` nested four deep. The catalog is a few thousand rows, it is read far
 * more often than it changes, and the whole payload is cached in this process —
 * so the query plan is not the interesting part, and legibility is. A join that
 * has to be re-read every time someone adds a field is a worse trade than nine
 * statements anyone can follow.
 *
 * The result is cached with the DB's own `catalog_revision` as the key. A publish
 * bumps that number, which is what makes the cache correct rather than merely
 * fast: the server does not have to be redeployed or told anything for a publish
 * to appear.
 */

import { query } from './db.js';
import { env } from './env.js';
import {
  HAIR_TYPE_IDS,
  type AdjustmentId,
  type CatalogResponse,
  type Category,
  type Gender,
  type HairColor,
  type HairLength,
  type HairLengthId,
  type HairShape,
  type HairType,
  type HairTypeId,
  type HairTypeExampleMap,
  type HairTypeVariants,
  type Hairstyle,
  type RenderManifest,
  type RenderRef,
  type VariantId,
  type ViewAngle,
} from './types.js';

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  genders: Gender[];
  sort_order: number;
}
interface HairTypeRow {
  id: HairTypeId;
  tier: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
}
interface HairLengthRow {
  id: HairLengthId;
  name: string;
  description: string;
  sort_order: number;
}
interface HairColorRow {
  id: string;
  name: string;
  hex: string;
  shade: string;
}
interface HairstyleRow {
  id: string;
  name: string;
  description: string;
  maintenance: Hairstyle['maintenance'];
  genders: Gender[];
  tags: string[];
  best_for: string[];
  adjustments: AdjustmentId[];
  popularity: number;
  shape: HairShape;
  image_url: string | null;
}
interface StyleCategoryRow {
  hairstyle_id: string;
  category_id: string;
  sort_order: number;
}
interface StyleVariantRow {
  hairstyle_id: string;
  hair_type_id: HairTypeId;
  variant_id: VariantId;
}
interface StyleLengthRow {
  hairstyle_id: string;
  gender: Gender;
  length_id: HairLengthId;
}
interface HairTypeExampleRow {
  hair_type_id: HairTypeId;
  gender: Gender;
  url: string;
}
interface RenderRow {
  hairstyle_id: string;
  variant_id: VariantId;
  length_id: HairLengthId;
  gender: Gender;
  angle: ViewAngle;
  url: string;
  mask_url: string | null;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** `null` for every type, so the app can index the row without a guard. */
const noVariants = (): HairTypeVariants =>
  Object.fromEntries(HAIR_TYPE_IDS.map((id) => [id, null])) as HairTypeVariants;

/**
 * Groups rows by a key, keeping input order within each group.
 *
 * Ordering is done in SQL (`order by`) rather than here, so "within each group"
 * means "as the database returned it" and the sort lives in one place.
 */
function groupBy<T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const existing = out.get(k);
    if (existing) existing.push(row);
    else out.set(k, [row]);
  }
  return out;
}

async function build(): Promise<Omit<CatalogResponse, 'revision'>> {
  const [
    categories, hairTypes, hairLengths, colors, styles,
    styleCategories, variants, lengths, renders, highlights, examples,
  ] = await Promise.all([
      query<CategoryRow>('select * from categories order by sort_order, id'),
      query<HairTypeRow>('select * from hair_types order by sort_order, id'),
      query<HairLengthRow>('select * from hair_lengths order by sort_order, id'),
      query<HairColorRow>('select id, name, hex, shade from hair_colors order by sort_order, id'),
      query<HairstyleRow>(
        `select id, name, description, maintenance, genders, tags, best_for, adjustments,
                popularity, shape, image_url
           from hairstyles
          where published
          order by popularity desc, name`,
      ),
      query<StyleCategoryRow>(
        `select hc.hairstyle_id, hc.category_id, c.sort_order
           from hairstyle_categories hc
           join categories c on c.id = hc.category_id
           join hairstyles h on h.id = hc.hairstyle_id and h.published
          order by c.sort_order, c.id`,
      ),
      query<StyleVariantRow>(
        `select v.hairstyle_id, v.hair_type_id, v.variant_id
           from hairstyle_variants v
           join hairstyles h on h.id = v.hairstyle_id and h.published`,
      ),
      query<StyleLengthRow>(
        `select l.hairstyle_id, l.gender, l.length_id
           from hairstyle_lengths l
           join hair_lengths hl on hl.id = l.length_id
           join hairstyles h on h.id = l.hairstyle_id and h.published
          order by hl.sort_order`,
      ),
      query<RenderRow>(
        `select r.hairstyle_id, r.variant_id, r.length_id, r.gender, r.angle,
                r.url, r.mask_url, r.width, r.height
           from renders r
           join hairstyles h on h.id = r.hairstyle_id and h.published`,
      ),
      query<{ body: string }>('select body from catalog_highlights order by sort_order, id'),
      query<HairTypeExampleRow>('select hair_type_id, gender, url from hair_type_examples'),
    ]);

  const byStyleCategory = groupBy(styleCategories, (row) => row.hairstyle_id);
  const byStyleVariant = groupBy(variants, (row) => row.hairstyle_id);
  const byStyleLength = groupBy(lengths, (row) => row.hairstyle_id);

  return {
    categories: categories.map(
      (row): Category => ({
        id: row.id,
        name: row.name,
        tagline: row.tagline,
        icon: row.icon,
        genders: row.genders,
        order: row.sort_order,
      }),
    ),
    hairTypes: hairTypes.map(
      (row): HairType => ({
        id: row.id,
        tier: row.tier,
        name: row.name,
        description: row.description,
        icon: row.icon,
        order: row.sort_order,
      }),
    ),
    hairLengths: hairLengths.map(
      (row): HairLength => ({
        id: row.id,
        name: row.name,
        description: row.description,
        order: row.sort_order,
      }),
    ),
    colors: colors.map((row): HairColor => ({ id: row.id, name: row.name, hex: row.hex, shade: row.shade })),
    highlights: highlights.map((row) => row.body),
    hairstyles: styles.map((row) => toHairstyle(row, byStyleCategory, byStyleVariant, byStyleLength)),
    renders: toManifest(renders),
    hairTypeExamples: toHairTypeExamples(examples, hairTypes.map((row) => row.id)),
  };
}

/**
 * Rows to `gender -> hair type -> url`, dropping any gender that is not complete.
 *
 * All four or none, per gender. The picker asks `hasHairTypeExamples()` before
 * it lays the rows out precisely because a half-illustrated list reads as a
 * broken screen rather than as a partial one, and enforcing it here means the
 * only way to serve a partial set is to change this function on purpose.
 */
function toHairTypeExamples(rows: HairTypeExampleRow[], hairTypeIds: HairTypeId[]): HairTypeExampleMap {
  const byGender = new Map<Gender, Partial<Record<HairTypeId, string>>>();
  for (const row of rows) {
    const entry = byGender.get(row.gender) ?? {};
    entry[row.hair_type_id] = row.url;
    byGender.set(row.gender, entry);
  }

  const out: HairTypeExampleMap = {};
  for (const [gender, entry] of byGender) {
    if (hairTypeIds.every((id) => entry[id])) out[gender] = entry;
  }
  return out;
}

function toHairstyle(
  row: HairstyleRow,
  byStyleCategory: Map<string, StyleCategoryRow[]>,
  byStyleVariant: Map<string, StyleVariantRow[]>,
  byStyleLength: Map<string, StyleLengthRow[]>,
): Hairstyle {
  const variants = noVariants();
  for (const entry of byStyleVariant.get(row.id) ?? []) variants[entry.hair_type_id] = entry.variant_id;

  // Absent rather than empty when there is nothing to offer: the app treats a
  // missing `lengths` and a `lengths` with fewer than two entries the same way,
  // but an empty object on every style would be noise in a payload that is
  // already the largest thing this endpoint returns.
  const offers: Partial<Record<Gender, HairLengthId[]>> = {};
  for (const entry of byStyleLength.get(row.id) ?? []) {
    (offers[entry.gender] ??= []).push(entry.length_id);
  }
  const lengths = Object.keys(offers).length ? offers : undefined;

  const hairstyle: Hairstyle = {
    id: row.id,
    name: row.name,
    categoryIds: (byStyleCategory.get(row.id) ?? []).map((entry) => entry.category_id),
    genders: row.genders,
    tags: row.tags,
    description: row.description,
    maintenance: row.maintenance,
    bestFor: row.best_for,
    popularity: row.popularity,
    adjustments: row.adjustments,
    variants,
    shape: row.shape,
  };
  if (lengths) hairstyle.lengths = lengths;
  // Only when it is actually set: the app's `<Mannequin>` prefers `imageUrl`
  // over the render index, so an accidental empty string here would blank the
  // whole catalog.
  if (row.image_url) hairstyle.imageUrl = row.image_url;
  return hairstyle;
}

/** Rows to the nested `style -> variant -> length -> gender -> angle` map. */
function toManifest(rows: RenderRow[]): RenderManifest {
  const manifest: RenderManifest = {};
  for (const row of rows) {
    const ref: RenderRef = {
      url: row.url,
      maskUrl: row.mask_url,
      width: row.width,
      height: row.height,
    };
    const byVariant = (manifest[row.hairstyle_id] ??= {});
    const byLength = (byVariant[row.variant_id] ??= {});
    const byGender = (byLength[row.length_id] ??= {});
    const byAngle = (byGender[row.gender] ??= {});
    byAngle[row.angle] = ref;
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface Cached {
  payload: CatalogResponse;
  /** When the revision was last confirmed against the database. */
  checkedAt: number;
}

let cached: Cached | null = null;
let inflight: Promise<CatalogResponse> | null = null;

export async function currentRevision(): Promise<number> {
  const rows = await query<{ revision: string }>('select revision from catalog_revision where id');
  // `bigint` comes back as a string from node-postgres, and rightly so.
  return rows[0] ? Number(rows[0].revision) : 0;
}

/**
 * The catalog, cached until the revision moves.
 *
 * Within `CATALOG_CACHE_MS` the cached payload is returned without touching the
 * database at all; after that one small query confirms the revision and either
 * extends the cache or rebuilds. Concurrent misses share one build — a cold
 * start under load should be one set of queries, not one per request.
 */
export async function getCatalog(): Promise<CatalogResponse> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < env.catalogCacheMs) return cached.payload;

  if (cached) {
    const revision = await currentRevision();
    if (revision === cached.payload.revision) {
      cached.checkedAt = now;
      return cached.payload;
    }
  }

  inflight ??= (async () => {
    try {
      // The revision is read *before* the payload: a publish landing mid-build
      // then leaves us with a revision older than the data, so the next request
      // rebuilds. Reading it after would cache new-looking metadata over rows
      // that were read before the publish, and never correct itself.
      const revision = await currentRevision();
      const payload: CatalogResponse = { ...(await build()), revision };
      cached = { payload, checkedAt: Date.now() };
      return payload;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Drops the cache. Only used by tests and by the `/v1/catalog?fresh=1` escape hatch. */
export function invalidateCatalog(): void {
  cached = null;
}
