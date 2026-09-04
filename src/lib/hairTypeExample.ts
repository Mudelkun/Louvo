import { hairTypeExamples as bundled } from '@/api/hairTypeExamples.generated';
import type { Gender, HairTypeExampleMap, HairTypeId } from '@/api/types';

/**
 * Anything the picker can draw: a bundled asset handle or a hosted url.
 *
 * Widened from the generated module's `number` for the same reason
 * `RenderSource` was — `expo-image` takes both, so the callers do not change.
 */
export type ExampleSource = number | { uri: string };

/**
 * The catalog's examples, once it has loaded.
 *
 * A module global rather than context, as with the render index: this is read
 * from inside render bodies by two screens, and there is only ever one catalog
 * in a process. `null` restores the bundled set, which is what a key-less,
 * server-less checkout runs on.
 */
let hosted: HairTypeExampleMap | null = null;

export function setHairTypeExamples(map: HairTypeExampleMap | null | undefined): void {
  // An empty object is not a set of examples — the server sends one when no
  // gender is complete — and treating it as one would blank the picker rather
  // than fall back to the icons.
  hosted = map && Object.keys(map).length ? map : null;
}

/** Whether the examples on screen came from the catalog rather than the bundle. */
export const usingHostedExamples = (): boolean => hosted !== null;

function lookup(gender: Gender, hairType: HairTypeId): ExampleSource | null {
  const url = hosted?.[gender]?.[hairType];
  if (url) return { uri: url };
  // Not a mixed set: once the catalog supplies a gender it supplies all four of
  // its types, so falling through here means the catalog has nothing for this
  // gender at all rather than a hole in the middle of one.
  return hosted ? null : bundled[gender]?.[hairType] ?? null;
}

/**
 * The generated example image for a hair type, if one has been generated.
 *
 * Two sources, resolved in order: the catalog's, installed from
 * `GET /v1/catalog` when there is an API, and the bundled module as the fallback
 * that keeps a server-less checkout working. Neither caller can tell which it
 * got — a bundled asset handle and a url are both things `expo-image` accepts.
 * Every lookup returns `null` rather than a placeholder, because the picker's
 * fallback is the type's icon and a broken image would be worse than the icon.
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
  if (gender) return lookup(gender, hairType);
  for (const fallback of GENDER_ORDER) {
    const source = lookup(fallback, hairType);
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
