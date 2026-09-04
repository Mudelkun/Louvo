/**
 * The length row, read.
 *
 * A deliberate parallel to `src/lib/hairTypes.ts`, and the same division of
 * labour: the judgement — does *this* cut survive being lengthened, and how far
 * — is catalog data (`lengths` on every hairstyle, see `HairLengthOffer`), and
 * nothing in here decides it. This only answers the questions the app asks of
 * that decision: does this cut offer a length choice at all, which positions,
 * and where does the slider start.
 *
 * The one rule worth stating twice, because it is what keeps the untouched
 * slider honest: **`medium` is the anchor, not the midpoint.** Every render in
 * `assets/mannequins/` was shot from a prompt that says nothing about length, so
 * what is on disk is the cut as the catalog authored it, and `medium` is the
 * name for that. A screen that opens at `medium` is therefore showing exactly
 * what it showed before length existed — which is why adding the slider changes
 * no imagery until the length renders are generated, and why `defaultLength()`
 * reaches for `medium` before it reaches for the middle of the range.
 */

import type { Gender, HairLength, HairLengthId, Hairstyle } from '@/api/types';

/** Short to long — the order is the slider. */
export const HAIR_LENGTH_IDS: HairLengthId[] = ['short', 'medium', 'long'];

/**
 * The length every catalog render already depicts, and so the position a style
 * screen opens on. See the note above.
 */
export const ANCHOR_LENGTH: HairLengthId = 'medium';

/**
 * The lengths this cut is offered at for this gender, in slider order.
 *
 * Empty for most of the catalog — a cut with no `lengths` row has no length
 * choice, which is the default rather than an omission. Sorted into
 * `HAIR_LENGTH_IDS` order rather than trusted to be authored that way, since the
 * row is hand-written per style and a slider whose stops run long-to-short would
 * be a silent bug rather than a visible one.
 */
export function lengthsFor(
  style: Pick<Hairstyle, 'lengths'>,
  gender: Gender | null | undefined,
): HairLengthId[] {
  if (!style.lengths || !gender) return [];
  const offered = style.lengths[gender];
  if (!offered?.length) return [];
  return HAIR_LENGTH_IDS.filter((id) => offered.includes(id));
}

/**
 * Whether to show the slider at all.
 *
 * Two positions is the floor: a control with one answer is a caption, and a cut
 * offered at exactly one length is simply a cut with no length choice — the same
 * thing as having no row. Stated here rather than at the call site so a screen
 * cannot accidentally render a one-stop slider.
 */
export function hasLengthChoice(
  style: Pick<Hairstyle, 'lengths'>,
  gender: Gender | null | undefined,
): boolean {
  return lengthsFor(style, gender).length > 1;
}

/**
 * Where the slider starts: the anchor when it is offered, the middle of the
 * range when it somehow is not.
 *
 * The fallback should never fire — every range is required to contain `medium`
 * (`HairLengthOffer`) — but it is the honest answer rather than a throw, because
 * a mis-authored row in the catalog is a bad slider position and not a reason to
 * fail a screen the user is looking at.
 */
export function defaultLength(
  style: Pick<Hairstyle, 'lengths'>,
  gender: Gender | null | undefined,
): HairLengthId | null {
  const offered = lengthsFor(style, gender);
  if (!offered.length) return null;
  if (offered.includes(ANCHOR_LENGTH)) return ANCHOR_LENGTH;
  return offered[Math.floor((offered.length - 1) / 2)];
}

/**
 * Reads a length off a `TryOnOptions`, which types it as a loose `string`
 * because the options bag predates this row and is shared with the fade and
 * colour fields.
 */
export function parseLength(value: string | null | undefined): HairLengthId | null {
  return value && (HAIR_LENGTH_IDS as string[]).includes(value) ? (value as HairLengthId) : null;
}

/**
 * The catalog's length records for the positions a cut actually offers, in
 * slider order — what the control is built from.
 *
 * The control is handed records rather than ids for the same reason
 * `<HairTypeChoice>` is: the label under a stop is catalog copy, so no screen
 * and no component contains the word "Short". An id the catalog has no record
 * for is dropped rather than rendered from its own id, which keeps a stop from
 * appearing unlabelled if the two ever drift.
 */
export function hairLengthsFor(
  catalog: HairLength[],
  offered: HairLengthId[],
): HairLength[] {
  return offered.flatMap((id) => {
    const entry = catalog.find((length) => length.id === id);
    return entry ? [entry] : [];
  });
}
