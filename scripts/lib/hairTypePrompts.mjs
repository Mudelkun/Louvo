/**
 * The prompt behind the hair-type picker's example images.
 *
 * Deliberately a different photograph from the catalog's. `lib/prompts.mjs`
 * turns a *hairstyle* into a picture of a haircut worn on a display head; this
 * turns a *hair type* into a picture of what hair does, and the two are not the
 * same brief:
 *
 *   - The subject is the curl pattern, not a cut. Every quadrant wears the same
 *     plain hair, so the only thing that changes between the four is
 *     the texture — which is exactly the question the picker asks.
 *   - The crop is tight on the head. The catalog frames the mannequin's display
 *     base because a card is a product shot; these are shown at the size of a
 *     list row, where a catalog framing would be mostly white plastic.
 *   - It is one text-to-image generation per gender, not an edit of the approved
 *     base sheet. There is no head to preserve across a run of 36 of them: there
 *     are two images in the whole set, and each one carries its own head.
 *
 * What the two *do* share is the object: the same blank faceless white mannequin
 * in the same material under the same light on the same white ground, and the
 * same espresso hair, so the picker and the catalog read as one app. Those
 * sentences are imported rather than restated — `BLANK_FACE`, `MATERIAL`,
 * `LIGHTING`, `BACKDROP` and `HAIR_COLOUR` all come from lib/prompts.mjs, and
 * the four type descriptions are the very same `HAIR_TYPES` the catalog's
 * `Hair type:` line is written from. A type reworded there is reworded here.
 */

import { TYPE_SHEET, typePanelLabel } from './hairTypeSheet.mjs';
import { BACKDROP, BLANK_FACE, GENDER_PROPORTIONS, HAIR_COLOUR, HAIR_TYPES, LIGHTING, MATERIAL } from './prompts.mjs';

/**
 * The one haircut in the whole sheet — one length per gender.
 *
 * It has to be long enough for a curl pattern to read at all (a type 4 coil is
 * invisible on a buzz cut), plain enough that nobody reads it as a style on
 * offer, and *worn the way that gender's hair is worn*. That last one is not a
 * nicety: one shared "roughly chin length" put shoulder-length centre-parted
 * hair on the masculine head, and the men's sheet came back looking like the
 * women's. The user picked a gender one screen earlier, so an example that does
 * not read as it is answering the wrong question.
 *
 * Both are the same brief otherwise — uncut, unstyled, no parting, no product —
 * and within a sheet the length never varies: the pattern is the only thing that
 * changes between the four quadrants.
 */
const EXAMPLE_HAIR = {
  male:
    "In every quadrant the mannequin wears the same short men's crop: roughly 8 cm (3 inches) on top and the same length at the back and sides, stopping above the ears so that both ears are fully visible and uncovered, and stopping at the hairline at the nape so that the neck is completely bare. Nothing hangs down beside the face. No hair reaches the jaw, the chin, the neck or the shoulders. It is emphatically not a bob, not a chin-length cut, not shoulder-length hair and not a centre parting — it is plainly a man's short hair, with no fade, no taper, no undercut, no parting, no styling and no product, at the shortest length its natural pattern can still be read at.",
  female:
    'In every quadrant the mannequin wears the same simple, unstyled, natural head of hair, worn long in the way a woman wears her hair: full coverage over the whole scalp, falling to about the chin or jaw, no parting, no fringe styling, no layering, no gel or product, nothing tied back. It is not a barbered haircut and not a fashion style — it is plain hair, shown so its natural pattern can be read.',
};

/**
 * The face is the other thing the first run got wrong: both sheets came back
 * with a sculpted nose and lips, which the catalog's own mannequins do not have.
 * `BLANK_FACE` says so already and is shared with the catalog, so rather than
 * edit that contract this repeats it in the terms the model actually missed.
 */
const FACE_RESTRAINT =
  'There is no face at all. Where a face would be there is only smooth blank white plastic: no sculpted nose, no nostrils, no lips, no mouth line, no eyes, no eye sockets, no brow ridge, no cheekbones and no chin cleft — not even faintly, and not even moulded in the same white plastic. Seen from the side, the line from the forehead down to the chin is one smooth unbroken curve with nothing protruding from it. It is a bald wig-display form, not a portrait mannequin.';

/** The one instruction worth saying twice — see where it is pushed, below. */
const LENGTH_REMINDER = {
  male:
    "Most important of all: in all four quadrants the hair is short — a man's crop above the ears, with both ears showing and the neck bare. If any quadrant would come out with hair falling to the jaw, the chin or the shoulders, cut it shorter.",
  female: null,
};

/** The quadrant list, as the prompt names them: "Top-left, Top-right, …". */
const PANELS = TYPE_SHEET.cells.map(typePanelLabel).join(', ');

/** `Top-left: Type 1 straight — …` for every quadrant, one per line. */
const panelSpecs = () =>
  TYPE_SHEET.cells.map((type) => `${typePanelLabel(type)}: ${HAIR_TYPES[type]}`).join('\n');

/**
 * One sheet: four hair types on one head, in one image, for one gender.
 *
 * `missing` names quadrants a previous attempt returned with no hair on them,
 * and `alike` names pairs it drew as the same texture twice — the two ways this
 * image fails. Naming them beats a plain re-roll, which tends to reproduce the
 * same mistake.
 *
 * @param {{ gender: string, missing?: string[], alike?: [string, string][] }} opts
 */
export function hairTypeSheetPrompt({ gender, missing = [], alike = [] }) {
  const lines = [
    `Studio reference chart of ${TYPE_SHEET.cells.length} faceless white display mannequin heads, arranged as a ${TYPE_SHEET.cols}x${TYPE_SHEET.rows} grid of ${TYPE_SHEET.cells.length} equal square quadrants — ${PANELS} — meeting edge to edge with no border, no gutter, no divider lines, no frames and no drop shadows.`,
    '',
    'It is the same head in all four quadrants: the same mannequin, the same sculpt, the same size, the same camera angle, the same distance and the same lighting. The four quadrants differ in exactly one respect — the natural pattern of the hair.',
    '',
    'Head and framing (identical in every quadrant):',
    '',
    'Gentle three-quarter view at eye level: the head turned only about 25 degrees to its own right, much closer to a dead-on front view than to a profile, with one ear coming into view.',
    'Crop tight on the head: the hair and the head fill the quadrant, cut off just below the chin. No neck plate, no display base, no plinth, no shoulders, no bust, no torso. The top of the hair must not be cut off by the top edge — leave a small margin of background all the way around the hair.',
    BLANK_FACE,
    FACE_RESTRAINT,
    MATERIAL,
    LIGHTING,
    BACKDROP,
    '',
    'Hair (identical in every quadrant except for the pattern):',
    '',
    EXAMPLE_HAIR[gender],
    `Hair color: ${HAIR_COLOUR} — the same shade in all four quadrants.`,
    'Photorealistic hair at realistic scale, worn as it naturally falls: no inflated volume, no wig-like mass, no glossy editorial sheen, no flyaway strands.',
    GENDER_PROPORTIONS[gender],
    '',
    'The pattern, one per quadrant:',
    '',
    panelSpecs(),
    '',
    `All ${TYPE_SHEET.cells.length} quadrants must be filled with a head wearing hair. None may be left bald, empty, blank or cropped away.`,
    'The four patterns must be immediately and obviously different from each other at a glance, and each must be unmistakably its own type: the straight hair completely flat and smooth with no bend anywhere and a sleek unbroken surface; the wavy hair rippled all over into deep, obvious S-bends that are plainly visible from across a room, never flat and never curled into closed loops; the curly hair in defined springy open curls; the coily hair in tight dense zig-zag coils. The gap between the straight quadrant and the wavy one has to be as obvious as the gap between the curly one and the coily one — flat versus visibly waved. Do not draw the same texture twice, and do not blend two of them into each other.',
    '',
    'No text, no letters, no numbers, no labels, no captions, no logos and no watermark anywhere in the image.',
  ];

  // Repeated at the end because that is where it lands. Stated once, in the hair
  // block, the length loses to everything after it: the first men's sheet came
  // back as four shoulder-length bobs on a masculine head, which is the women's
  // picture with the wrong sculpt.
  if (LENGTH_REMINDER[gender]) lines.push('', LENGTH_REMINDER[gender]);

  if (missing.length) {
    lines.push(
      '',
      `Attention: a previous attempt returned the ${listOf(missing.map(typePanelLabel))} ${plural(missing, 'quadrant')} with no hair on the head. Fix that: every quadrant must show the head wearing hair in its own pattern.`,
    );
  }

  if (alike.length) {
    const pairs = alike.map(([a, b]) => `${typePanelLabel(a)} and ${typePanelLabel(b)}`);
    lines.push(
      '',
      `Attention: a previous attempt drew ${listOf(pairs)} as the same texture. Draw them clearly differently this time — ${alike
        .flat()
        .filter((type, index, all) => all.indexOf(type) === index)
        .map((type) => `${typePanelLabel(type)} is ${HAIR_TYPES[type]}`)
        .join('; ')}.`,
    );
  }

  return lines.join('\n');
}

/** `Top-left`, `Top-left and Top-right`, `A, B and C`. */
function listOf(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const plural = (items, word) => (items.length === 1 ? word : `${word}s`);
