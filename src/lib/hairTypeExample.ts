import { hairTypeExamples, type ExampleSource } from '@/api/hairTypeExamples.generated';
import type { Gender, HairTypeId } from '@/api/types';

/**
 * The generated example image for a hair type, if one has been generated.
 *
 * `scripts/generate-hair-type-examples.mjs` writes the PNGs and rewrites the
 * generated module, so an example picked up here appears in the picker as soon
 * as its image lands — nothing else has to be edited. Every lookup returns
 * `null` rather than a placeholder, because the picker's fallback is the type's
 * icon and a broken image would be worse than the icon.
 *
 * Gender is matched exactly when the caller knows it — a type 4 coil on a
 * feminine head is a different picture from the same coil on a masculine one,
 * and the user has already told us which of the two they are looking for
 * (`app/try/gender.tsx`, the step before this one). When it does not, whichever
 * exists is shown, male first, the same convention `mannequinRender()` uses.
 *
 * Nothing is graded here. These images illustrate what hair *does*, and colour
 * is a property of neither a hairstyle nor a hair type — see `colorGrade.ts`,
 * which is for the catalog's renders and not for these.
 */
const GENDER_ORDER: Gender[] = ['male', 'female'];

export function hairTypeExample(
  gender: Gender | null | undefined,
  hairType: HairTypeId,
): ExampleSource | null {
  if (gender) return hairTypeExamples[gender]?.[hairType] ?? null;
  for (const fallback of GENDER_ORDER) {
    const source = hairTypeExamples[fallback]?.[hairType];
    if (source) return source;
  }
  return null;
}

/**
 * Whether this gender has a full set of examples.
 *
 * The picker asks before it lays the rows out: four rows where two carry a
 * photograph and two carry an icon reads as a broken screen, so a partial set is
 * shown as no set at all. It cannot normally happen — the four come out of one
 * generated sheet — but a half-copied directory should not reach the user.
 */
export function hasHairTypeExamples(
  gender: Gender | null | undefined,
  hairTypes: HairTypeId[],
): boolean {
  return hairTypes.length > 0 && hairTypes.every((hairType) => hairTypeExample(gender, hairType));
}
