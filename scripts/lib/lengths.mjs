/**
 * The length row, read by the generator.
 *
 * A deliberate mirror of `src/lib/hairLengths.ts`, for exactly the reason
 * `variants.mjs` mirrors `hairTypes.ts`: the app's copy is TypeScript behind the
 * `@/` alias and nothing under `scripts/` can import from `src/`. Both copies
 * read the same `lengths` rows out of the catalog, which is where the
 * classification actually lives — keep the two in step, and change neither of
 * them to hold an opinion about a hairstyle.
 *
 * The load-bearing idea, and the one that decides the whole disk layout:
 * **`medium` is the anchor, not the midpoint.** Every render already in
 * `assets/mannequins/` was shot from a prompt that says nothing about length, so
 * what is on disk is the cut as the catalog authored it. That is what `medium`
 * names. It follows that the anchor render keeps the path it already has —
 * `<style>/<variant>/<gender>-<angle>.png` — and only `short` and `long` go into
 * a subdirectory. 356 renders and their masks therefore need no migration, and a
 * style with no length row at all is simply a style whose only render is its
 * anchor. See `lengthDir()`.
 */

/** Short to long — the order the slider runs in and the order rows are drawn in. */
export const HAIR_LENGTH_IDS = ['short', 'medium', 'long'];

/**
 * The length every existing render depicts. It has no directory of its own: it
 * *is* the variant directory.
 */
export const ANCHOR_LENGTH = 'medium';

/**
 * Where a length's renders live inside the variant directory — `null` for the
 * anchor, which stays where it always was.
 */
export const lengthDir = (length) => (length === ANCHOR_LENGTH ? null : length);

/**
 * The lengths one style x gender is offered at, in slider order.
 *
 * Empty for most of the catalog. A style with no `lengths` row has no length
 * dimension, which is the default rather than an omission — most cuts have no
 * useful range, and a fade's variable is its fade height. Sorted into
 * `HAIR_LENGTH_IDS` order rather than trusted, since the row is authored by hand.
 */
export function lengthsOf(style, gender) {
  const offered = style.lengths?.[gender];
  if (!offered?.length) return [];
  return HAIR_LENGTH_IDS.filter((id) => offered.includes(id));
}

/** Whether this style x gender is shot as a length sheet rather than a plain one. */
export function hasLengths(style, gender) {
  return lengthsOf(style, gender).length > 1;
}

/**
 * Every style x gender pair in the catalog that carries a length row, in catalog
 * order — the work list `--lengths --plan` prints commands from.
 */
export function lengthPairs(catalog, { styles = null, genders = null } = {}) {
  const pairs = [];
  for (const style of catalog.hairstyles) {
    if (styles && !styles.includes(style.id)) continue;
    for (const gender of style.genders) {
      if (genders && !genders.includes(gender)) continue;
      const lengths = lengthsOf(style, gender);
      if (lengths.length > 1) pairs.push({ style, gender, lengths });
    }
  }
  return pairs;
}

/**
 * Checks a length row against the rules the app relies on, returning a list of
 * complaints rather than throwing.
 *
 * `medium` is required in every range because it is the anchor: a range without
 * it would open the style screen on a length the catalog has never shot, and the
 * untouched slider would be making a claim the imagery cannot back. The other
 * two rules are the kind of thing a hand-authored table gets wrong silently.
 */
export function validateLengths(style) {
  const problems = [];
  if (!style.lengths) return problems;

  for (const [gender, list] of Object.entries(style.lengths)) {
    const where = `${style.id}/${gender}`;
    if (!style.genders.includes(gender)) problems.push(`${where}: style is not offered to ${gender}`);
    if (!Array.isArray(list) || list.length < 2) {
      problems.push(`${where}: fewer than two stops — no slider would show`);
      continue;
    }
    if (new Set(list).size !== list.length) problems.push(`${where}: duplicate stop`);
    if (!list.includes(ANCHOR_LENGTH)) problems.push(`${where}: range has no "${ANCHOR_LENGTH}" anchor`);
    for (const id of list) {
      if (!HAIR_LENGTH_IDS.includes(id)) problems.push(`${where}: "${id}" is not a length`);
    }
    const sorted = HAIR_LENGTH_IDS.filter((id) => list.includes(id));
    if (sorted.join() !== list.join()) problems.push(`${where}: not in short -> long order`);
  }
  return problems;
}
