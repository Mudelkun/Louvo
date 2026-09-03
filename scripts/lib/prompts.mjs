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
 * The one shade the whole catalog is shot in.
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

/**
 * The shade each variant is shot in.
 *
 * This is the one place the "colour is a grade, not a generation" rule bends,
 * and it bends for a reason rather than for a colour: espresso reads as a muddy
 * mid-brown on the textured variants, because a dense coil or curl is mostly
 * self-shadow and there is very little lit surface left to carry the hue. It
 * showed on type 4 first and worst, which is why coily was the first row to go
 * black; the curly renders had the same problem a level down, so **curly and
 * coily are both shot black** and the loose textures stay espresso.
 *
 * It is still not a colour *choice* — nobody picks these, and no style has its
 * own. There are two shades across five rows, and the app grades from whichever
 * one the render it is showing was shot in (`baseHairColor()` in
 * `src/lib/constants.ts`). Adding a shade a user can pick is still a row in the
 * catalog's colour list and still costs no generation.
 *
 * Change one of these and the matching anchor has to be re-measured from the new
 * renders: `node scripts/measure-hair-tone.mjs` prints one mean per variant.
 */
const BLACK = 'Natural black — #131110';

export const HAIR_COLOURS = {
  any: HAIR_COLOUR,
  straight: HAIR_COLOUR,
  wavy: HAIR_COLOUR,
  curly: BLACK,
  coily: BLACK,
};

/** The shade a given variant is generated in. */
export const hairColour = (variant) => HAIR_COLOURS[variant ?? 'any'] ?? HAIR_COLOUR;

/**
 * The other variable, and the only other one.
 *
 * Hair type *is* generated, unlike colour — a coily textured crop is a
 * different silhouette, not a recolour of the curly one, and no filter gets you
 * from one to the other. So the catalog is shot per variant of the hairstyle ×
 * hair type matrix (`variants` in the catalog, `lib/variants.mjs`), and this is
 * the one sentence that changes between two shots of the same cut. Everything
 * else in the prompt — the head, the material, the light, the crop, the colour
 * — is identical by construction.
 *
 * `any` is the variant for a cut the matrix says needs only one render: a buzz
 * cut, a flat-ironed blowout, box braids. It states no hair type at all, which
 * is the honest instruction — the cut is what decides the texture there, and
 * naming a type would only make one arbitrary reading of it the catalog's.
 *
 * The wording is deliberately the typing system's own, in the same register as
 * `HAIR_COLOUR`: the model reads "Type 4 coily" far more reliably than any
 * description of coils written out longhand.
 */
export const HAIR_TYPES = {
  any: null,
  straight: 'Type 1 straight — poker straight, no bend or curl at all, lying flat to the head',
  wavy: 'Type 2A–2C wavy — loose S-shaped waves, no defined curls',
  curly: 'Type 3A–3B curly — defined springy curls and loops',
  coily: 'Type 4A–4C coily — tight coils and zig-zag kinks, dense and shrunken',
};

/** The variant the pre-matrix catalog was shot in, kept for the record. */
export const LEGACY_HAIR_TYPE = 'curly';

/**
 * The bare label the catalog's `Hair type:` line is written from.
 *
 * Deliberately shorter than `HAIR_TYPES` above. Those descriptions exist to make
 * four textures come back visibly different from each other *within one image* —
 * the picker's example sheet draws all four side by side and has to be told how
 * they differ. A catalog sheet draws one texture and needs no such contrast, and
 * the curly catalog already on disk was shot with exactly this bare form. Adding
 * prose here would make the coily batch a different prompt from the curly one it
 * has to sit beside, which is the one thing a consistency contract cannot allow.
 */
export const HAIR_TYPE_LABELS = {
  any: null,
  straight: 'Type 1 straight',
  wavy: 'Type 2A–2C wavy',
  curly: 'Type 3A–3B curly',
  coily: 'Type 4A–4C coily',
};

/** The `Hair type:` line for a variant, or nothing at all for `any`. */
export function hairTypeLine(variant) {
  const label = HAIR_TYPE_LABELS[variant ?? 'any'];
  return label ? `Hair type: ${label}` : null;
}

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
/**
 * The three sentences that describe the *object* rather than the shot: a blank
 * face, matte white plastic in named values, and high-key light on white.
 *
 * Exported one by one because the hair-type example sheet
 * (`lib/hairTypePrompts.mjs`) is a different photograph of the same object — a
 * tight texture specimen, not a catalog card — and the material is the part that
 * has to match exactly for the two sets of imagery to read as one app. The crop
 * and framing are the part that deliberately does not, so they stay below.
 */
export const BLANK_FACE =
  'The face is a completely smooth, blank plane: no eyes, no nose, no mouth, no eyebrows, no eyelashes, no facial features of any kind, no makeup, no skin pores, no identifiable ethnicity. The ears are sculpted and clearly visible.';
export const MATERIAL =
  'Material: matte white mannequin plastic — highlights #E9E8E6, mid-tone #E2E1DE, shadows #D4D1CD. A cool, near-neutral white with soft grey shading; not cream, not beige, not skin-toned. No gloss, no specular hotspots, no mould seams, no text or branding.';
export const LIGHTING =
  'Lighting: soft, diffuse, high-key studio light from the upper left. Shading only under the jaw and down one side of the neck; no hard shadows, no dark areas, no cast shadow on the background.';
export const BACKDROP =
  'Background: flat pure white #FFFFFF, completely plain — no gradient, no vignette, no props, no text, no watermark.';

export const HOUSE_STYLE = [
  'Studio product photograph of a faceless white display mannequin — the head and neck only.',
  "Crop: the head, the neck and the top of the mannequin's flat display base fill the frame. The neck flares outwards at the bottom into a wide, flat, angled base plate that runs off the left and right edges of the frame and is cut by the bottom edge — exactly like a shop display head. It is a flat sculpted plate, never a rounded bust: no real shoulders, no collarbones, no arms, no chest, no torso, no stand or pedestal.",
  BLANK_FACE,
  MATERIAL,
  LIGHTING,
  BACKDROP,
  'Framing: centred in a square frame, camera at eye level, the head occupying the middle 70-75% of the frame at exactly the same scale in every image.',
  HAIR_SENTENCE,
].join(' ');

/**
 * Four angles. `half` — the gentle three-quarter turn — is the hero: it is
 * `HERO_ANGLE` in the app, so it is the image on every catalog card and at the
 * top of every style screen, and it is the one view where the taper, the ear and
 * the nape all read at once.
 *
 * It used to be inherited from `scripts/reference-head.png` rather than
 * described, on the theory that the reference was already at the wanted angle.
 * It is not: the reference is turned far enough that the face plane is edge-on
 * and you are looking at the back-right of the skull. So the base head faithfully
 * reproduced a *rear* three-quarter, every style inherited it, and the catalog
 * ended up with two profiles and no hero. See `baseHalfFromFrontPrompt`.
 */
const ANGLE_DIRECTION = {
  front:
    'Dead-on front view at eye level: the head faces the camera squarely, the blank face plane flat to the lens and perfectly symmetrical. Both ears are equally visible, the hairline runs level across the forehead, and the nape is hidden behind the head. No turn at all — not even a slight three-quarter angle.',
  half: 'Gentle three-quarter view at eye level: the head turned only about 25 degrees to its own right, much closer to a dead-on front view than to a profile. The whole blank face plane is still visible, angled towards the left of the frame, with one ear and the taper above it coming into view on the right.',
  side: 'Exact 90-degree left profile: the head turned a full quarter turn so the blank face plane points straight at the left edge of the frame and is seen edge-on, with one full ear, the taper and the whole nape flat to the camera. A true profile — turn the head all the way, not the partial three-quarter turn of the reference.',
  back: 'Camera directly behind the head; only the back of the skull, the nape and the back of the neck are visible; no face and no front of the ears visible.',
};

/**
 * The hero head, made by turning the approved dead-on front head.
 *
 * Describing this angle from scratch does not work — "three-quarter, about 30
 * degrees" comes back at 50-60 every time, because the model reads
 * "three-quarter" as far closer to a profile than a barber would — and
 * inheriting it from the reference does not work either, because the reference
 * is itself a rear three-quarter.
 *
 * So it is neither described nor inherited: it is a *rotation of an image that
 * is already right*. `_base/<gender>-front.png` is an approved, dead-on,
 * correctly framed and lit bald head, and the only instruction is to turn it a
 * little. That makes the angle a small delta from a known-good starting point
 * instead of an absolute the model has to hit blind, and it carries the
 * material, the crop, the light and the scale over pixel-for-pixel — the same
 * reason every hairstyle is an edit of a base head rather than a fresh render.
 *
 * The negative clauses are doing real work. Left to itself the model overshoots
 * this rotation every time, so what is wrong is spelled out as explicitly as
 * what is wanted.
 */
export function baseHalfFromFrontPrompt(gender) {
  return [
    'Edit the first image. It is the approved dead-on front view of this mannequin, and everything about it except the rotation of the head is correct and must be preserved exactly.',
    'Change one thing only: rotate the head a little to its own right, about 25 to 30 degrees — a gentle three-quarter turn that is much closer to the front view you have been given than to a profile.',
    'The whole blank face plane must still face the camera and remain fully visible, angled slightly towards the left of the frame. The near ear and the taper above it come into view on the right; the far side of the face is still shown.',
    'Do not overshoot. This must not become a profile, a 45-degree turn, a three-quarter view from behind, or any view in which the face plane is edge-on, foreshortened away, or hidden. The back of the skull and the nape must not be the subject. If in doubt, turn it less.',
    'Keep the face completely blank — no eyes, no nose, no mouth, no eyebrows, no facial features of any kind — and keep the sculpted ears. The mannequin stays completely bald: smooth hairless scalp, no hair, no wig cap, no stubble, no hairline drawn on.',
    GENDER_PROPORTIONS[gender],
    'Everything else is unchanged: the same head and neck sculpt, the same matte white material and shading, the same soft high-key light from the upper left, the same flat white background, the same wide flat display base, the same crop, the same scale and the same position in the frame.',
  ].join(' ');
}

export const GENDER_PROPORTIONS = {
  male: 'Masculine proportions: a squarer jaw line, a slightly wider neck and a straight, slightly lower hairline. Still completely featureless.',
  female: 'Feminine proportions: a softer, narrower jaw line and a slimmer, slightly longer neck. Still completely featureless.',
};

/**
 * How the *haircut* is gendered, as opposed to the head wearing it.
 *
 * `GENDER_PROPORTIONS` above is about the mannequin sculpt, and it has no place
 * in a sheet prompt: the sculpt is in the reference image and the sheet prompt
 * spends a whole paragraph telling the model not to touch it. This is the other
 * half, and it is the half the sheet prompt was missing — a hairstyle *name* is
 * not gender-neutral. Handed "Messy Fringe" and nothing else, the model returns
 * the men's reading of the name onto whichever head it is given, so every style
 * offered to both genders — Messy Fringe, Curtain Bangs, Afro, Wolf Cut, Top
 * Knot — came back as one haircut twice and the women's render looked like the
 * men's. Styles whose name already carries the gender (Blunt Bob, Pixie Cut,
 * Textured Lob) were unaffected, which is exactly the shape of the bug.
 *
 * `label` genders the cut wherever the prompt names it; `line` is the
 * instruction in the specification block. Both, because one mention of it loses
 * to the model's default reading often enough to be worth the words.
 */
export const GENDER_CUT = {
  male: {
    label: "men's",
    line: "Worn by: a man — cut, shaped and finished as a men's barber would give this haircut, never the women's version of the same name.",
  },
  female: {
    label: "women's",
    line: "Worn by: a woman — cut, shaped and finished as a women's salon would give this haircut, never the men's version of the same name.",
  },
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
 * the catalog's one shade and the variant's hair type.
 *
 * `shape.texture` is still not what states the texture, and never was: it used
 * to open this sentence ("defined springy curls, worn as a low taper fade") and
 * it dominated the render — every cut came back as a curly mass. The hair type
 * now arrives as its own labelled line at the end instead, which the model
 * treats as a specification rather than as the subject of the image, and it is
 * the variant's type rather than the style's own. `shape.texture` stays what it
 * always was: the descriptor the placeholder mannequin is drawn from.
 */
export function describeHair(style, variant = 'any') {
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

  const type = hairTypeLine(variant);
  return `${parts.join(', ')}. Hair colour: ${hairColour(variant)}.${type ? ` ${type}.` : ''} ${style.description}`;
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
    ANGLE_DIRECTION[angle],
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
export function stylePrompt({ style, gender, angle, variant = 'any', extra }) {
  const lines = [
    'Edit the first image. Keep the mannequin exactly as it is: same head and neck shape, same blank featureless face, same matte white material and shading, same white background, same lighting, same camera angle, same crop and same scale. Do not add eyes, a nose, a mouth or any facial feature. Do not turn it into a real person. Do not zoom out and do not re-frame: keep the neck and the wide flat display base exactly as they are, and never turn that base into shoulders, a chest or a torso.',
    `Change only one thing: give the mannequin ${describeHair(style, variant)}`,
    ANGLE_DIRECTION[angle],
    GENDER_PROPORTIONS[gender],
    'The hair sits on the scalp with a believable hairline and realistic strand detail, photographed in the same studio setup.',
    HAIR_RESTRAINT,
  ];
  if (extra) lines.push(extra);
  return lines.join(' ');
}

/** Fallback when there is no base head to edit: one-shot text-to-image. */
export function standaloneStylePrompt({ style, gender, angle, variant = 'any', extra }) {
  const lines = [
    HOUSE_STYLE,
    GENDER_PROPORTIONS[gender],
    ANGLE_DIRECTION[angle],
    `The mannequin wears ${describeHair(style, variant)}`,
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
 *
 * The haircut is the exception, and `gender` is the part of it the reference
 * cannot carry: the base sheet supplies a woman's *head*, not a woman's *cut*.
 * See `GENDER_CUT`.
 */
export function styleSheetPrompt({ style, gender, variant = 'any', extra, missing = [] }) {
  const name = style.name;
  const gendered = GENDER_CUT[gender];
  // How the cut is named everywhere the prompt names it — "women's Messy
  // Fringe". Falls back to the bare name when the caller has no gender, which
  // is only the dry run of a base head.
  const cut = gendered ? `${gendered.label} ${name}` : name;
  const count = SHEET.cells.length;
  const panels = SHEET.positions.join(', ');
  const type = hairTypeLine(variant);

  const lines = [
    `Use the provided image as the exact visual reference. It contains ${count} views of the same mannequin wearing the same hairstyle, one per quadrant: ${panels}. Recreate the image while applying the requested ${cut} to the mannequins.`,
    '',
    // The failure this guards against: three heads come back styled and the
    // fourth is passed through untouched from the reference. It is `front`, the
    // flattest view, that gets skipped most often — the model appears to treat a
    // quadrant it has copied verbatim as work already done.
    `All ${count} heads must be wearing the hairstyle. Every quadrant — ${panels} — is a separate head that has to be re-drawn with the new hair: none of the ${count} may be left bald, left with the reference's own hair, or copied through unchanged. A quadrant returned without the hairstyle makes the whole image unusable.`,
    '',
    'Hair specifications:',
    '',
    `Hairstyle: ${cut}`,
    `Hair color: ${hairColour(variant)}`,
    ...(type ? [type] : []),
    ...(gendered ? [gendered.line] : []),
    '',
    'Reference fidelity is critical: Keep the exact same mannequin design, head shape, facial surface, proportions, skin/material appearance, camera angles, framing, lighting, background, positioning, and four-view layout from the reference image.',
    '',
    'Do not redesign or modify the mannequin in any way. Do not add facial features, eyes, nose, mouth, eyebrows, ethnicity-specific characteristics, skin-tone changes, accessories, clothing, or other identifying features.',
    '',
    `The only meaningful change should be the hair: replace the existing hairstyle with ${cut} while maintaining the same mannequin and presentation across all four views.`,
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
      `Attention: a previous attempt returned the ${listOf(labels)} ${plural(labels, 'quadrant')} still bald, with the mannequin's scalp bare. Fix that: ${listOf(labels)} must wear the same ${cut} as the other views — the same length, shape and colour, drawn correctly for that camera angle — while the ${count} views stay consistent with each other.`,
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
