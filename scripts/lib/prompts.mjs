/**
 * Turns a catalog record into a prompt.
 *
 * Nothing here names a hairstyle: every sentence is derived from the `shape`
 * descriptor, the tags and the description that already live in the catalog, so
 * a style added to the database tomorrow gets a sensible prompt with no code
 * change. `scripts/mannequin-overrides.json` is the escape hatch for the one or
 * two styles the generic vocabulary describes badly.
 */

import { SHEET, panelLabel } from './sheet.mjs';

/**
 * Left to itself the model renders hair as an editorial wig — inflated volume,
 * separated ringlets, flyaways, gloss. The reference is a real haircut, so this
 * clause goes into every prompt: the base heads and the standalone fallback get
 * it through HOUSE_STYLE, and `stylePrompt` (an edit prompt, which does not
 * carry HOUSE_STYLE) repeats it explicitly.
 */
const HAIR_RESTRAINT =
  "It is a real barber's haircut at realistic scale, worn close to the head: no inflated volume, no wig-like mass, no loose flyaway strands, no glossy editorial sheen.";

/**
 * The one shade the whole catalog is shot in, and the one hair type.
 *
 * Deliberately not per style. Colour is not generated at all any more: the app
 * grades this render to whatever shade the user picks (`src/lib/colorGrade.ts`),
 * so asking the model for a different colour per hairstyle would only add a
 * variable between two catalog images that the user cannot see anyway, and would
 * put the grade's anchor somewhere different in every image.
 *
 * Changing it means re-shooting the catalog *and* re-measuring
 * `BASE_HAIR_COLOR.hex` in `src/lib/constants.ts` from the new renders — the
 * grade starts from what the model returns, which is a shade off what is asked
 * for here.
 */
export const HAIR_COLOUR = 'Espresso brown — #33231B';
const HAIR_TYPE = 'Type 3A–3B curly';

const HAIR_SENTENCE = [
  'The hair is photorealistic, cleanly styled and lit, and is the only thing in the frame that draws attention.',
  HAIR_RESTRAINT,
  'Hair longer than the crop simply continues past the bottom edge of the frame; it never turns the display base into shoulders or a body.',
].join(' ');

/**
 * The consistency contract. Every image in the catalog is the same head, the
 * same material, the same light, the same crop — only the hair differs. This
 * block is repeated verbatim in every prompt and must not be edited per style.
 *
 * The material, lighting and crop are matched to `App-reference.png`: a matte
 * white display head cut off at the base of the neck, lit high-key from the
 * upper left on white. Colours below are sampled from that file — highlight
 * #E9E8E6, mid-tone #E2E1DE, shadow #D4D1CD, background #FFFFFF.
 */
export const HOUSE_STYLE = [
  'Studio product photograph of a faceless white display mannequin — the head and neck only.',
  "Crop: the head, the neck and the top of the mannequin's flat display base fill the frame. The neck flares outwards at the bottom into a wide, flat, angled base plate that runs off the left and right edges of the frame and is cut by the bottom edge — exactly like a shop display head. It is a flat sculpted plate, never a rounded bust: no real shoulders, no collarbones, no arms, no chest, no torso, no stand or pedestal.",
  'The face is a completely smooth, blank plane: no eyes, no nose, no mouth, no eyebrows, no eyelashes, no facial features of any kind, no makeup, no skin pores, no identifiable ethnicity. The ears are sculpted and clearly visible.',
  'Material: matte white mannequin plastic — highlights #E9E8E6, mid-tone #E2E1DE, shadows #D4D1CD. A cool, near-neutral white with soft grey shading; not cream, not beige, not skin-toned. No gloss, no specular hotspots, no mould seams, no text or branding.',
  'Lighting: soft, diffuse, high-key studio light from the upper left. Shading only under the jaw and down one side of the neck; no hard shadows, no dark areas, no cast shadow on the background.',
  'Background: flat pure white #FFFFFF, completely plain — no gradient, no vignette, no props, no text, no watermark.',
  'Framing: centred in a square frame, camera at eye level, the head occupying the middle 70-75% of the frame at exactly the same scale in every image.',
  HAIR_SENTENCE,
].join(' ');

/**
 * Four angles. `half` — the three-quarter turn — is the hero: the one view where
 * the taper, the ear and the nape all read at once, and the angle the hero in
 * `App-reference.png` is shot at. It is not described in words here, because
 * words do not work for it (see KEEP_REFERENCE_ANGLE); it is inherited from the
 * reference image instead.
 */
const ANGLE_DIRECTION = {
  front:
    'Dead-on front view at eye level: the head faces the camera squarely, the blank face plane flat to the lens and perfectly symmetrical. Both ears are equally visible, the hairline runs level across the forehead, and the nape is hidden behind the head. No turn at all — not even a slight three-quarter angle.',
  half: 'Gentle three-quarter view at eye level: the head turned only about 25 degrees to its own right, much closer to a dead-on front view than to a profile. The whole blank face plane is still visible, angled towards the left of the frame, with one ear and the taper above it coming into view on the right.',
  side: 'Exact 90-degree left profile: the head turned a full quarter turn so the blank face plane points straight at the left edge of the frame and is seen edge-on, with one full ear, the taper and the whole nape flat to the camera. A true profile — turn the head all the way, not the partial three-quarter turn of the reference.',
  back: 'Camera directly behind the head; only the back of the skull, the nape and the back of the neck are visible; no face and no front of the ears visible.',
};

/**
 * The reference is already a three-quarter view at exactly the angle the catalog
 * wants, so for `half` the instruction is to leave the pose alone rather than
 * describe it. Describing the turn in words does not work: "three-quarter hero
 * view, about 30 degrees" comes back at 50-60 degrees every time, because the
 * model reads "three-quarter" as far closer to a profile than a barber would.
 * The other three angles have to be described — the reference cannot show them.
 */
const KEEP_REFERENCE_ANGLE =
  'Keep the head at exactly the same angle and pose as the reference image: the same gentle three-quarter turn, the same position in the frame, the same amount of face and ear showing. Do not rotate, turn, tilt or re-pose the head at all, and do not turn it further towards a profile — the reference angle is the approved one and must be preserved exactly.';

const GENDER_PROPORTIONS = {
  male: 'Masculine proportions: a squarer jaw line, a slightly wider neck and a straight, slightly lower hairline. Still completely featureless.',
  female: 'Feminine proportions: a softer, narrower jaw line and a slimmer, slightly longer neck. Still completely featureless.',
};

/** Picks the phrase whose threshold the value falls under. */
const band = (value, table) => (table.find(([limit]) => value <= limit) ?? table[table.length - 1])[1];

const TOP = [
  [0.08, 'clipper-shaved on top, barely any length'],
  [0.2, 'a very short cropped top'],
  [0.34, 'a short top with just enough length to style'],
  [0.5, 'a medium top with visible body'],
  [0.7, 'a long, high-volume top'],
  [1, 'a very tall, full-height top with maximum volume'],
];

// Lengths are described against the head and the frame, never against a body:
// the crop stops at the base of the neck, so anything longer simply runs off the
// bottom edge.
const SIDES = [
  [0.05, 'sides and back taken down to the skin in a clean skin fade'],
  [0.12, 'very short faded sides, the ears fully exposed'],
  [0.2, 'short tapered sides, the ears fully exposed'],
  [0.32, 'short sides just covering the top of the ears'],
  [0.5, 'sides falling to the jaw'],
  [0.7, 'sides falling past the chin with clear layers'],
  [0.9, 'long sides running down past the base of the neck and out of the bottom of the frame'],
  [1, 'very long sides running well past the base of the neck and out of the bottom of the frame'],
];

const BACK = [
  [0.02, 'cut clean and sharp at the nape'],
  [0.15, 'ending just below the nape'],
  [0.35, 'reaching the middle of the neck'],
  [0.6, 'reaching the base of the neck'],
  [0.85, 'falling long down the back and out of the bottom of the frame'],
  [1, 'falling very long down the back and out of the bottom of the frame'],
];

const FRINGE = [
  [0.05, 'swept straight back off the forehead with no fringe'],
  [0.2, 'the hairline left exposed'],
  [0.45, 'a short fringe brushed onto the forehead'],
  [0.65, 'a fringe covering the upper forehead'],
  [1, 'a heavy fringe covering the forehead down to the brow line'],
];

/**
 * Human-readable hair description built entirely from the catalog record, in
 * the catalog's one shade.
 *
 * Texture is deliberately not stated. `shape.texture` used to open this sentence
 * ("defined springy curls, worn as a low taper fade") and it dominated the
 * render — every cut came back as a curly mass. The name of the cut already
 * implies its texture, so the prompt names the cut and leaves texture alone;
 * `shape.texture` stays what it is elsewhere, the descriptor the placeholder
 * mannequin is drawn from.
 */
export function describeHair(style) {
  const { shape } = style;
  const parts = [
    `a ${style.name.toLowerCase()}`,
    band(shape.top, TOP),
    band(shape.sides, SIDES),
    band(shape.back, BACK),
    band(shape.fringe, FRINGE),
  ];

  if (shape.part === 'side') parts.push('a defined side parting');
  if (shape.part === 'middle') parts.push('a centre parting');
  if (shape.knot) parts.push('the length gathered into a knot/bun at the crown');
  if (shape.tail) parts.push('the length gathered into a tied ponytail');

  return `${parts.join(', ')}. Hair colour: ${HAIR_COLOUR}. ${style.description}`;
}

/**
 * The preferred way to make a base head: edit the approved reference image, so
 * the material, lighting, crop and background are *carried over* rather than
 * described in words. `scripts/reference-head.png` is cropped straight out of
 * `App-reference.png`, which is why the catalog matches the mockup.
 */
export function baseHeadFromReferencePrompt(gender, angle) {
  return [
    'Edit the first image. Keep the mannequin exactly as it is: the same matte white material and shading, the same soft high-key lighting from the upper left, the same white background and the same crop — head, neck and the wide flat flared display base exactly as they are in the reference, with no real shoulders and no torso.',
    'Remove all of the hair: the mannequin is completely bald, with a smooth hairless scalp, no hair, no wig cap, no stubble and no hairline drawn on.',
    'Keep the face completely blank — no eyes, no nose, no mouth, no eyebrows, no facial features of any kind — and keep the sculpted ears.',
    GENDER_PROPORTIONS[gender],
    angle === 'half' ? KEEP_REFERENCE_ANGLE : ANGLE_DIRECTION[angle],
    'Change nothing else: same material, same light, same background, same scale.',
  ].join(' ');
}

/** Fallback when there is no reference image: describe the head from scratch. */
export function baseHeadPrompt(gender, angle) {
  return [
    HOUSE_STYLE.replace(
      HAIR_SENTENCE,
      'The mannequin is completely bald: a smooth hairless scalp, no hair, no wig cap, no stubble, no hairline drawn on.',
    ),
    GENDER_PROPORTIONS[gender],
    ANGLE_DIRECTION[angle],
  ].join(' ');
}

/**
 * Prompt for one hairstyle, phrased as an edit of the approved base head so the
 * head itself is carried over pixel-for-pixel instead of re-invented per style.
 */
export function stylePrompt({ style, gender, angle, extra }) {
  const lines = [
    'Edit the first image. Keep the mannequin exactly as it is: same head and neck shape, same blank featureless face, same matte white material and shading, same white background, same lighting, same camera angle, same crop and same scale. Do not add eyes, a nose, a mouth or any facial feature. Do not turn it into a real person. Do not zoom out and do not re-frame: keep the neck and the wide flat display base exactly as they are, and never turn that base into shoulders, a chest or a torso.',
    `Change only one thing: give the mannequin ${describeHair(style)}`,
    ANGLE_DIRECTION[angle],
    GENDER_PROPORTIONS[gender],
    'The hair sits on the scalp with a believable hairline and realistic strand detail, photographed in the same studio setup.',
    HAIR_RESTRAINT,
  ];
  if (extra) lines.push(extra);
  return lines.join(' ');
}

/** Fallback when there is no base head to edit: one-shot text-to-image. */
export function standaloneStylePrompt({ style, gender, angle, extra }) {
  const lines = [
    HOUSE_STYLE,
    GENDER_PROPORTIONS[gender],
    ANGLE_DIRECTION[angle],
    `The mannequin wears ${describeHair(style)}`,
  ];
  if (extra) lines.push(extra);
  return lines.join(' ');
}

// ---------------------------------------------------------------------------
// Four-view sheets
//
// One generation per style, and one haircut instead of four independent rolls of
// it. See lib/sheet.mjs: the base sheet is composed from base heads that were
// approved one at a time, so the four camera angles are inherited from images
// that have been looked at rather than described in words — which is what the
// prompt below relies on when it says the reference is the specification.
// ---------------------------------------------------------------------------

/**
 * One hairstyle, as an edit of the composed base sheet.
 *
 * The mannequin, the four camera angles, the framing and the light are not
 * described here at all — they are in the reference image, and the prompt's job
 * is to say so. Describing them in words is what produced re-posed heads and
 * over-rotated three-quarters; a sentence cannot pin a camera angle as well as
 * the pixels already can.
 */
export function styleSheetPrompt({ style, extra, missing = [] }) {
  const name = style.name;
  const count = SHEET.cells.length;
  const panels = SHEET.positions.join(', ');

  const lines = [
    `Use the provided image as the exact visual reference. It contains ${count} views of the same mannequin wearing the same hairstyle, one per quadrant: ${panels}. Recreate the image while applying the requested ${name} to the mannequins.`,
    '',
    // The failure this guards against: three heads come back styled and the
    // fourth is passed through untouched from the reference. It is `front`, the
    // flattest view, that gets skipped most often — the model appears to treat a
    // quadrant it has copied verbatim as work already done.
    `All ${count} heads must be wearing the hairstyle. Every quadrant — ${panels} — is a separate head that has to be re-drawn with the new hair: none of the ${count} may be left bald, left with the reference's own hair, or copied through unchanged. A quadrant returned without the hairstyle makes the whole image unusable.`,
    '',
    'Hair specifications:',
    '',
    `Hairstyle: ${name}`,
    `Hair color: ${HAIR_COLOUR}`,
    `Hair type: ${HAIR_TYPE}`,
    '',
    'Reference fidelity is critical: Keep the exact same mannequin design, head shape, facial surface, proportions, skin/material appearance, camera angles, framing, lighting, background, positioning, and four-view layout from the reference image.',
    '',
    'Do not redesign or modify the mannequin in any way. Do not add facial features, eyes, nose, mouth, eyebrows, ethnicity-specific characteristics, skin-tone changes, accessories, clothing, or other identifying features.',
    '',
    `The only meaningful change should be the hair: replace the existing hairstyle with ${name} while maintaining the same mannequin and presentation across all four views.`,
    '',
    'Ensure that the hairstyle is consistent across all four views of the same mannequin, with accurate hair continuity between the front, side, rear, and three-quarter views.',
    '',
    'The result should look like a clean professional hairstyle reference/catalog image, with realistic but polished 3D hair, clearly showing the haircut from every angle.',
  ];

  // Naming the quadrant that failed is the whole point of the retry: a plain
  // re-roll of the same prompt tends to skip a head again, and often the same one.
  if (missing.length) {
    const labels = missing.map(panelLabel);
    lines.push(
      '',
      `Attention: a previous attempt returned the ${listOf(labels)} ${plural(labels, 'quadrant')} still bald, with the mannequin's scalp bare. Fix that: ${listOf(labels)} must wear the same ${name} as the other views — the same length, shape and colour, drawn correctly for that camera angle — while the ${count} views stay consistent with each other.`,
    );
  }

  if (extra) lines.push('', extra);
  return lines.join('\n');
}

/** `Top-left`, `Top-left and Bottom-right`, `A, B and C`. */
function listOf(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const plural = (items, word) => (items.length === 1 ? word : `${word}s`);
