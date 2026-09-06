/**
 * Placeholder catalog.
 *
 * Stands in for the `GET /catalog` response the Node API will serve from the
 * Railway database. Everything here is data: adding a style or a category must
 * never require touching a screen.
 */

import type {
  Catalog,
  Category,
  HairColor,
  HairLength,
  HairLengthId,
  HairLengthOffer,
  HairType,
  HairTypeVariants,
  Hairstyle,
  HairShape,
  TextureKind,
  VariantId,
} from './types';

const categories: Category[] = [
  { id: 'short', name: 'Short Cuts', tagline: 'Clean, sharp and low effort', icon: 'cut-outline', genders: ['male', 'female'], order: 1 },
  { id: 'medium', name: 'Medium Cuts', tagline: 'Versatile everyday lengths', icon: 'layers-outline', genders: ['male', 'female'], order: 2 },
  { id: 'long', name: 'Long Hair', tagline: 'Flow, layers and movement', icon: 'water-outline', genders: ['male', 'female'], order: 3 },
  { id: 'fades', name: 'Fades', tagline: 'Tapers, skins and blends', icon: 'trending-down-outline', genders: ['male', 'female'], order: 4 },
  { id: 'updo', name: 'Braids & Updos', tagline: 'Tied back and out of the way', icon: 'git-merge-outline', genders: ['male', 'female'], order: 5 },
  { id: 'locs', name: 'Locs & Twists', tagline: 'Locked, twisted and grown out', icon: 'barcode-outline', genders: ['male', 'female'], order: 6 },
  { id: 'trendy', name: 'Trending', tagline: 'What people are asking for now', icon: 'flame-outline', genders: ['male', 'female'], order: 7 },
];


/**
 * The four hair types, types 1 to 4 — the catalog's primary dimension.
 *
 * This is the axis the user is asked about first, before any category, because
 * it decides which hairstyles are on offer at all and which render of each one
 * they are shown (`variants` on every row below). `Straight`, `Wavy` and
 * `Curly` used to also be browse *categories*; they are not any more, because
 * asking the same question on two axes only produces empty intersections.
 * Categories are about length and shape now, hair type is about texture.
 */
const hairTypes: HairType[] = [
  { id: 'straight', tier: 'Type 1', name: 'Straight', description: 'Falls straight with little or no curl', icon: 'remove-outline', order: 1 },
  { id: 'wavy', tier: 'Type 2', name: 'Wavy', description: 'Forms loose S-shaped waves', icon: 'pulse-outline', order: 2 },
  { id: 'curly', tier: 'Type 3', name: 'Curly', description: 'Forms defined curls or loops', icon: 'sync-outline', order: 3 },
  { id: 'coily', tier: 'Type 4', name: 'Coily', description: 'Forms tight coils, kinks or zig-zag patterns', icon: 'ellipse-outline', order: 4 },
];

/**
 * The length positions the slider can offer, short to long.
 *
 * Catalog data for the same reason the hair types above are: no screen and no
 * component may contain the word "Short". The descriptions are what the control
 * shows under the selected stop, so they are written as what the *cut* does, not
 * as what the slider does — "cropped closer than the cut usually sits" rather
 * than "the short option".
 *
 * `medium` is the anchor: it is the cut exactly as the catalog shot it, which is
 * why its description says so. Every render in `assets/mannequins/` predates
 * length and depicts this position, so a slider sitting untouched at `medium` is
 * making a claim the imagery already backs. See `HairLengthOffer`.
 */
const hairLengths: HairLength[] = [
  { id: 'short', name: 'Short', description: 'Cropped closer than this cut usually sits', order: 1 },
  { id: 'medium', name: 'Medium', description: 'The cut at its usual length', order: 2 },
  { id: 'long', name: 'Long', description: 'Grown out, with more weight and drop', order: 3 },
];

/**
 * The ranges a cut can be offered at, so the table below reads as a table.
 *
 * All three contain `medium`, which is the constraint rather than a coincidence
 * — see `HairLengthOffer`. `SM` and `ML` are for cuts that only travel one way
 * from where they sit: a Pixie Cut grown out is a bob, and Long Layers cropped
 * short are not Long Layers.
 */
const SML: HairLengthId[] = ['short', 'medium', 'long'];
const SM: HairLengthId[] = ['short', 'medium'];
const ML: HairLengthId[] = ['medium', 'long'];

/** One row of the length table: which lengths each gender's version is offered at. */
const len = (male: HairLengthId[] | null, female: HairLengthId[] | null): HairLengthOffer => ({
  ...(male ? { male } : null),
  ...(female ? { female } : null),
});

/**
 * The shades any style can be put in. Every one of them is reached by grading
 * the render in the app rather than by generating a second image, so this list
 * can grow without costing anything.
 *
 * `jet` is where the app starts (`DEFAULT_HAIR_COLOR_ID`): the imagery is shot
 * in espresso except the coily variant, which is shot in black, and grading
 * everything to black is what makes those one catalog instead of two. The
 * imagery's own shades are `BASE_HAIR_COLORS` — the grade's anchors, not
 * entries here.
 */
const colors: HairColor[] = [
  { id: 'jet', name: 'Jet Black', hex: '#171313', shade: '#000000' },
  { id: 'espresso', name: 'Espresso', hex: '#392D24', shade: '#241B15' },
  { id: 'chestnut', name: 'Chestnut', hex: '#5E3D26', shade: '#3B2415' },
  { id: 'auburn', name: 'Auburn', hex: '#8A4326', shade: '#5E2B16' },
  { id: 'caramel', name: 'Caramel', hex: '#A9743F', shade: '#7A4E26' },
  { id: 'honey', name: 'Honey Blonde', hex: '#C9A063', shade: '#9C7740' },
  { id: 'platinum', name: 'Platinum', hex: '#DDD3C4', shade: '#B3A897' },
  { id: 'ash', name: 'Ash Grey', hex: '#9C978F', shade: '#726D66' },
  { id: 'silver', name: 'Silver Fox', hex: '#C6C7C9', shade: '#9B9CA0' },
  { id: 'smoke', name: 'Smoke Blue', hex: '#5C6E86', shade: '#3E4B5C' },
  { id: 'rose', name: 'Rose Gold', hex: '#C08A8A', shade: '#966465' },
  { id: 'burgundy', name: 'Burgundy', hex: '#6B2438', shade: '#471523' },
];

/** Shorthand so the style table below stays readable. */
const shape = (
  top: number,
  sides: number,
  back: number,
  fringe: number,
  texture: TextureKind,
  extra: Partial<HairShape> = {},
): HairShape => ({ top, sides, back, fringe, texture, ...extra });

/**
 * One row of the hairstyle × hair type matrix: which render each of the four
 * types is shown. Reading `v('straight', 'straight', 'curly', 'coily')`: three
 * renders cover four types, because this cut's wavy version is indistinguishable
 * from its straight one. `null` means the style is not offered for that type.
 *
 * The classification is a judgement about the haircut, so it lives beside the
 * haircut. `src/lib/hairTypes.ts` reads it; nothing there decides it.
 */
const v = (
  straight: VariantId | null,
  wavy: VariantId | null,
  curly: VariantId | null,
  coily: VariantId | null,
): HairTypeVariants => ({ straight, wavy, curly, coily });

/** Hair-type independent: one render serves everyone. */
const anyType = (): HairTypeVariants => v('any', 'any', 'any', 'any');

/** Fully hair-type dependent: four renders, one per type. */
const perType = (): HairTypeVariants => v('straight', 'wavy', 'curly', 'coily');

type Row = Omit<Hairstyle, 'imageUrl'>;

const hairstyles: Row[] = [
  {
    id: 'buzz-cut',
    name: 'Buzz Cut',
    categoryIds: ['short'],
    genders: ['male', 'female'],
    tags: ['low maintenance', 'summer', 'classic'],
    description: 'A single clipper length all over. Nothing to style and nothing to hide behind, so it lives or dies on your head shape.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square'],
    popularity: 78,
    adjustments: ['length', 'color'],
    // One clipper length all over — no texture survives it.
    variants: anyType(),
    shape: shape(0.06, 0.1, 0, 0.08, 'straight'),
  },
  {
    id: 'crew-cut',
    name: 'Crew Cut',
    categoryIds: ['short'],
    genders: ['male'],
    tags: ['classic', 'office', 'easy'],
    description: 'Short and tapered on the sides with a little length left on top. The default good haircut.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Square'],
    popularity: 84,
    adjustments: ['length', 'fade', 'color'],
    // At this length type 1 and 2 sit identically.
    variants: v('straight', 'straight', 'curly', 'coily'),
    lengths: len(SML, null),
    shape: shape(0.2, 0.16, 0, 0.15, 'straight'),
  },
  {
    id: 'textured-crop',
    name: 'Textured Crop',
    categoryIds: ['short', 'trendy', 'fades'],
    genders: ['male'],
    tags: ['modern', 'messy', 'popular'],
    description: 'Choppy, matte texture on top pushed forward into a short fringe, with tight sides.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Long'],
    popularity: 93,
    adjustments: ['length', 'fade', 'color'],
    // The cut is texture; all four read apart.
    variants: perType(),
    lengths: len(SML, null),
    shape: shape(0.33, 0.14, 0, 0.45, 'spiky'),
  },
  {
    id: 'french-crop',
    name: 'French Crop',
    categoryIds: ['short', 'fades'],
    genders: ['male'],
    tags: ['fringe', 'sharp', 'european'],
    description: 'A blunt, straight fringe sitting on the forehead with faded sides. Clean lines, very little upkeep.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square'],
    popularity: 81,
    adjustments: ['fade', 'color'],
    // The fringe only stays blunt on type 1 and 2.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.24, 0.12, 0, 0.62, 'straight'),
  },
  {
    id: 'caesar-cut',
    name: 'Caesar Cut',
    categoryIds: ['short'],
    genders: ['male'],
    tags: ['fringe', 'retro'],
    description: 'Short, horizontally cut fringe combed forward. Forgiving on a receding hairline.',
    maintenance: 'Low',
    bestFor: ['Round', 'Oval'],
    popularity: 62,
    adjustments: ['length', 'color'],
    // A forward fringe behaves differently once it coils.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.18, 0.18, 0, 0.55, 'straight'),
  },
  {
    id: 'ivy-league',
    name: 'Ivy League',
    categoryIds: ['short', 'medium'],
    genders: ['male'],
    tags: ['smart', 'side part', 'office'],
    description: 'A crew cut grown out enough to take a side part. Smart without looking fussy.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square'],
    popularity: 70,
    adjustments: ['length', 'fade', 'color'],
    // Type 1 and 2 comb into the same side sweep.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.3, 0.2, 0, 0.3, 'straight', { part: 'side' }),
  },
  {
    id: 'low-taper-fade',
    name: 'Low Taper Fade',
    categoryIds: ['fades', 'short', 'trendy'],
    genders: ['male'],
    tags: ['barber favourite', 'clean', 'sharp'],
    description: 'The fade starts low, just above the ear, and blends gradually. Subtle enough for any setting.',
    maintenance: 'High',
    bestFor: ['Oval', 'Round', 'Heart'],
    popularity: 97,
    adjustments: ['length', 'fade', 'color'],
    // The fade is constant; the top is not.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.36, 0.13, 0, 0.35, 'curly'),
  },
  {
    id: 'mid-fade',
    name: 'Mid Fade',
    categoryIds: ['fades', 'short'],
    genders: ['male'],
    tags: ['balanced', 'sharp'],
    description: 'A fade that starts halfway up the side. The safe middle ground between low and high.',
    maintenance: 'High',
    bestFor: ['Oval', 'Square'],
    popularity: 90,
    adjustments: ['length', 'fade', 'color'],
    // The fade is constant; the top is not.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.34, 0.09, 0, 0.3, 'straight'),
  },
  {
    id: 'high-skin-fade',
    name: 'High Skin Fade',
    categoryIds: ['fades', 'trendy'],
    genders: ['male'],
    tags: ['bold', 'contrast', 'sharp'],
    description: 'Skin at the bottom climbing high up the side for maximum contrast against the top.',
    maintenance: 'High',
    bestFor: ['Oval', 'Long'],
    popularity: 88,
    adjustments: ['length', 'fade', 'color'],
    // Sides are skin, so only the island on top varies.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.42, 0.04, 0, 0.3, 'straight'),
  },
  {
    id: 'burst-fade',
    name: 'Burst Fade',
    categoryIds: ['fades', 'trendy'],
    genders: ['male'],
    tags: ['curly friendly', 'street'],
    description: 'The fade radiates around the ear and leaves weight at the back. Made for curly and coily hair.',
    maintenance: 'High',
    bestFor: ['Oval', 'Diamond'],
    popularity: 86,
    adjustments: ['fade', 'color'],
    // Enough length left on top for all four to read apart.
    variants: perType(),
    shape: shape(0.48, 0.1, 0.06, 0.32, 'coily'),
  },
  {
    id: 'quiff',
    name: 'Quiff',
    categoryIds: ['medium', 'trendy'],
    genders: ['male'],
    tags: ['volume', 'night out'],
    description: 'Length at the front lifted up and back into a soft peak. Needs a blow dryer to look right.',
    maintenance: 'High',
    bestFor: ['Square', 'Oval', 'Round'],
    popularity: 85,
    adjustments: ['length', 'fade', 'color'],
    // A quiff is built out of whatever the texture is.
    variants: perType(),
    // No short stop: the front has to be long enough to lift.
    lengths: len(ML, null),
    shape: shape(0.68, 0.22, 0, 0.06, 'wavy'),
  },
  {
    id: 'pompadour',
    name: 'Pompadour',
    categoryIds: ['medium', 'trendy'],
    genders: ['male'],
    tags: ['retro', 'volume', 'statement'],
    description: 'Big, swept-back volume at the front held high off the forehead. A commitment.',
    maintenance: 'High',
    bestFor: ['Oval', 'Square'],
    popularity: 74,
    adjustments: ['length', 'fade', 'color'],
    // Combed and set, so type 1 and 2 converge.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.85, 0.2, 0, 0.02, 'straight'),
  },
  {
    id: 'side-part',
    name: 'Classic Side Part',
    categoryIds: ['medium'],
    genders: ['male'],
    tags: ['timeless', 'office'],
    description: 'A hard or natural parting with the bulk combed to one side. Always appropriate.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round', 'Heart'],
    popularity: 76,
    adjustments: ['length', 'fade', 'color'],
    // The part needs hair that lies down; on type 4 it is cut in.
    variants: v('straight', 'straight', 'curly', 'coily'),
    lengths: len(SML, null),
    shape: shape(0.4, 0.24, 0, 0.22, 'straight', { part: 'side' }),
  },
  {
    id: 'messy-fringe',
    name: 'Messy Fringe',
    categoryIds: ['medium', 'trendy'],
    genders: ['male', 'female'],
    tags: ['casual', 'youthful'],
    description: 'Loose, undone length falling forward over the brow. Deliberately unstructured.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Long'],
    popularity: 82,
    adjustments: ['length', 'color'],
    // Messy is the texture doing the work.
    variants: perType(),
    // Men's only: the women's reading of this cut is Curtain Bangs, which carries
    // the row instead. One cut with a slider beats two that overlap.
    lengths: len(SML, null),
    shape: shape(0.42, 0.32, 0.04, 0.78, 'wavy'),
  },
  {
    id: 'curtain-bangs',
    name: 'Curtain Bangs',
    categoryIds: ['medium', 'trendy'],
    genders: ['female', 'male'],
    tags: ['soft', 'face framing'],
    description: 'A centre-parted fringe that sweeps away on both sides to frame the face.',
    maintenance: 'Medium',
    bestFor: ['Round', 'Square', 'Heart'],
    popularity: 94,
    adjustments: ['length', 'color'],
    // How the curtain falls is entirely the texture.
    variants: perType(),
    // Women's only: the men's reading of this cut is Messy Fringe. See that row.
    lengths: len(null, SML),
    shape: shape(0.3, 0.6, 0.55, 0.55, 'wavy', { part: 'middle' }),
  },
  {
    id: 'blunt-bob',
    name: 'Blunt Bob',
    categoryIds: ['medium', 'trendy'],
    genders: ['female'],
    tags: ['sharp', 'chic'],
    description: 'One length, cut clean at the jaw with no layers. Graphic and very deliberate.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Heart'],
    popularity: 91,
    adjustments: ['length', 'color'],
    // Four genuinely different bobs.
    variants: perType(),
    shape: shape(0.22, 0.72, 0.3, 0.35, 'straight'),
  },
  {
    id: 'textured-lob',
    name: 'Textured Lob',
    categoryIds: ['medium'],
    genders: ['female'],
    tags: ['easy', 'everyday'],
    description: 'A long bob with soft internal layers, sitting just past the collarbone.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Square'],
    popularity: 89,
    adjustments: ['length', 'color'],
    // Texture is in the name.
    variants: perType(),
    shape: shape(0.28, 0.85, 0.5, 0.3, 'wavy', { part: 'middle' }),
  },
  {
    id: 'pixie-cut',
    name: 'Pixie Cut',
    categoryIds: ['short', 'trendy'],
    genders: ['female'],
    tags: ['bold', 'low effort'],
    description: 'Cropped close at the back and sides with textured length left on top.',
    maintenance: 'Medium',
    bestFor: ['Heart', 'Oval'],
    popularity: 79,
    adjustments: ['length', 'color'],
    // Cut to the texture, but type 1 and 2 pixies read alike.
    variants: v('straight', 'straight', 'curly', 'coily'),
    // No long stop: a pixie grown out is a bob, which the catalog already carries.
    lengths: len(null, SM),
    shape: shape(0.38, 0.24, 0.02, 0.5, 'spiky', { part: 'side' }),
  },
  {
    id: 'long-layers',
    name: 'Long Layers',
    categoryIds: ['long'],
    genders: ['female'],
    tags: ['movement', 'classic'],
    description: 'Length kept long with layers cut through the mid-lengths so it moves instead of hanging flat.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round', 'Long'],
    popularity: 92,
    adjustments: ['length', 'color'],
    // Layers hang differently in every type.
    variants: perType(),
    // No short stop: cropped short these stop being long layers.
    lengths: len(null, ML),
    shape: shape(0.26, 0.95, 0.92, 0.25, 'straight', { part: 'middle' }),
  },
  {
    id: 'beach-waves',
    name: 'Beach Waves',
    categoryIds: ['long'],
    genders: ['female'],
    tags: ['relaxed', 'summer'],
    description: 'Loose, undone S-waves through the length. Looks effortless, takes forty minutes.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square', 'Heart'],
    popularity: 95,
    adjustments: ['length', 'color'],
    // A set look — the same waves whatever the base.
    variants: anyType(),
    lengths: len(null, SML),
    shape: shape(0.34, 0.95, 0.88, 0.22, 'wavy', { part: 'middle' }),
  },
  {
    id: 'sleek-straight',
    name: 'Sleek & Straight',
    categoryIds: ['long'],
    genders: ['female'],
    tags: ['polished', 'glossy'],
    description: 'Pressed flat and glossy from root to tip with a razor-clean centre part.',
    maintenance: 'High',
    bestFor: ['Oval', 'Heart'],
    popularity: 80,
    adjustments: ['length', 'color'],
    // Flat-ironed; every base ends up in the same place.
    variants: anyType(),
    lengths: len(null, SML),
    shape: shape(0.14, 1, 0.95, 0.2, 'straight', { part: 'middle' }),
  },
  {
    id: 'shoulder-flow',
    name: 'Shoulder Flow',
    categoryIds: ['long'],
    genders: ['male'],
    tags: ['grown out', 'relaxed'],
    description: 'Grown-out length swept back off the face and falling to the shoulders.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square'],
    popularity: 72,
    adjustments: ['length', 'color'],
    // Worn loose, so the silhouette is the texture.
    variants: perType(),
    shape: shape(0.4, 0.8, 0.6, 0.1, 'wavy', { part: 'middle' }),
  },
  {
    id: 'man-bun',
    name: 'Man Bun',
    categoryIds: ['long', 'updo'],
    genders: ['male'],
    tags: ['tied back', 'practical'],
    description: 'Long hair gathered and knotted at the back of the crown, sides left down or faded.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square'],
    popularity: 68,
    adjustments: ['fade', 'color'],
    // Gathered — only the bulk of the knot changes.
    variants: v('straight', 'straight', 'curly', 'curly'),
    shape: shape(0.3, 0.3, 0.12, 0.08, 'straight', { knot: true }),
  },
  {
    id: 'top-knot',
    name: 'Top Knot',
    categoryIds: ['updo', 'trendy'],
    genders: ['male', 'female'],
    tags: ['tied back', 'sharp sides'],
    description: 'Everything on top pulled up into a knot above shaved or faded sides.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Diamond'],
    popularity: 66,
    adjustments: ['fade', 'color'],
    // Gathered — only the bulk of the knot changes.
    variants: v('straight', 'straight', 'curly', 'curly'),
    shape: shape(0.26, 0.06, 0, 0.05, 'straight', { knot: true }),
  },
  {
    id: 'curly-top',
    name: 'Curly Top',
    categoryIds: ['medium'],
    genders: ['male'],
    tags: ['natural curl', 'volume'],
    description: 'Curls left long on top with the sides cut back so the curl pattern reads clearly.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square'],
    popularity: 87,
    adjustments: ['length', 'fade', 'color'],
    // Not a type 1 cut; type 2 reads as a loose version of the curly one.
    variants: v(null, 'curly', 'curly', 'coily'),
    lengths: len(SML, null),
    shape: shape(0.62, 0.16, 0, 0.3, 'curly'),
  },
  {
    id: 'afro',
    name: 'Afro',
    categoryIds: ['trendy'],
    genders: ['male', 'female'],
    tags: ['natural', 'volume', 'statement'],
    description: 'Coils grown out evenly in every direction and shaped into a round silhouette.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square', 'Heart'],
    popularity: 83,
    adjustments: ['length', 'color'],
    // Needs the texture to exist at all.
    variants: v(null, null, 'curly', 'coily'),
    // Length here reads as height. Still length — it is the same variable a barber
    // sets with a guard, and 'Length' is the word the user is looking for.
    lengths: len(SML, SML),
    shape: shape(0.95, 0.55, 0.1, 0.2, 'coily'),
  },
  {
    id: 'twist-out',
    name: 'Twist Out',
    categoryIds: ['medium'],
    genders: ['female', 'male'],
    tags: ['natural', 'defined coils'],
    description: 'Two-strand twists taken down for defined, springy coils with plenty of body.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round'],
    popularity: 84,
    adjustments: ['length', 'color'],
    // A technique for coils, not a cut.
    variants: v(null, null, 'curly', 'coily'),
    shape: shape(0.72, 0.62, 0.24, 0.28, 'coily'),
  },
  {
    id: 'curly-shag',
    name: 'Curly Shag',
    categoryIds: ['trendy', 'medium'],
    genders: ['female'],
    tags: ['layered', 'rock'],
    description: 'Heavy layering through curly hair with a full fringe. Deliberately shaggy.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Long'],
    popularity: 88,
    adjustments: ['length', 'color'],
    // Not a type 1 cut; the other three shags each differ.
    variants: v(null, 'wavy', 'curly', 'coily'),
    lengths: len(null, SML),
    shape: shape(0.58, 0.8, 0.55, 0.7, 'curly'),
  },
  {
    id: 'loose-curls',
    name: 'Loose Curls',
    categoryIds: ['long'],
    genders: ['female'],
    tags: ['soft', 'romantic'],
    description: 'Wide barrel curls through long hair, brushed out so they fall soft rather than tight.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square', 'Heart'],
    popularity: 90,
    adjustments: ['length', 'color'],
    // A set look — curled to the same result from any base.
    variants: anyType(),
    lengths: len(null, SML),
    shape: shape(0.44, 0.95, 0.85, 0.25, 'curly', { part: 'side' }),
  },
  {
    id: 'wolf-cut',
    name: 'Wolf Cut',
    categoryIds: ['trendy', 'medium'],
    genders: ['female', 'male'],
    tags: ['layered', 'internet famous'],
    description: 'A shag and a mullet met halfway: heavy top layers, wispy ends, plenty of attitude.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round'],
    popularity: 89,
    adjustments: ['length', 'color'],
    // Shag layers exaggerate whatever the texture is.
    variants: perType(),
    lengths: len(SML, SML),
    shape: shape(0.55, 0.7, 0.62, 0.68, 'wavy'),
  },
  {
    id: 'butterfly-cut',
    name: 'Butterfly Cut',
    categoryIds: ['trendy', 'long'],
    genders: ['female'],
    tags: ['face framing', 'bouncy'],
    description: 'Short face-framing layers over long length, so it reads as two haircuts at once.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Long', 'Square'],
    popularity: 93,
    adjustments: ['length', 'color'],
    // A blowout, so type 1 and 2 land in the same place.
    variants: v('straight', 'straight', 'curly', 'coily'),
    // No short stop: the long underlayer is what makes it a butterfly cut.
    lengths: len(null, ML),
    shape: shape(0.5, 0.92, 0.8, 0.42, 'wavy', { part: 'middle' }),
  },
  {
    id: 'modern-mullet',
    name: 'Modern Mullet',
    categoryIds: ['trendy', 'medium'],
    genders: ['male', 'female'],
    tags: ['bold', 'retro revival'],
    description: 'Short and tight at the front and sides, deliberately long at the back.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Diamond'],
    popularity: 71,
    adjustments: ['length', 'fade', 'color'],
    // The back reads completely differently per type.
    variants: perType(),
    // No short stop: a mullet cropped short loses the back it is named for.
    lengths: len(ML, ML),
    shape: shape(0.4, 0.18, 0.55, 0.35, 'wavy'),
  },
  {
    id: 'mohawk',
    name: 'Mohawk',
    categoryIds: ['trendy', 'fades'],
    genders: ['male', 'female'],
    tags: ['statement', 'shaved sides'],
    description: 'A strip of length down the centre with everything either side taken to the skin.',
    maintenance: 'High',
    bestFor: ['Oval', 'Long'],
    popularity: 55,
    adjustments: ['fade', 'color'],
    // The strip is set, so type 1 and 2 spike alike.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.9, 0.02, 0, 0.1, 'spiky'),
  },
  {
    id: 'box-braids',
    name: 'Box Braids',
    categoryIds: ['updo', 'long'],
    genders: ['female', 'male'],
    tags: ['protective', 'long lasting'],
    description: 'Sectioned braids installed to the length you want, low effort once they are in.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Heart'],
    popularity: 86,
    adjustments: ['length', 'color'],
    // Installed — the braid is the braid.
    variants: anyType(),
    // Braid length is the choice people actually make with this style.
    lengths: len(SML, SML),
    shape: shape(0.3, 0.95, 0.9, 0.2, 'coily', { part: 'middle' }),
  },
  {
    id: 'high-ponytail',
    name: 'High Ponytail',
    categoryIds: ['updo'],
    genders: ['female'],
    tags: ['sleek', 'quick'],
    description: 'Everything pulled up tight and gathered high at the crown.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 77,
    adjustments: ['length', 'color'],
    // Gathered; type 3 and 4 both read as a puff.
    variants: v('straight', 'straight', 'curly', 'curly'),
    lengths: len(null, SML),
    shape: shape(0.2, 0.12, 0.6, 0.1, 'straight', { tail: true }),
  },
  {
    id: 'slick-back',
    name: 'Slick Back',
    categoryIds: ['medium', 'trendy'],
    genders: ['male'],
    tags: ['sharp', 'formal'],
    description: 'Everything combed straight back off the face with product holding it in place.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square', 'Diamond'],
    popularity: 83,
    adjustments: ['length', 'fade', 'color'],
    // Product does the work up to type 3.
    variants: v('straight', 'straight', 'curly', 'coily'),
    shape: shape(0.45, 0.26, 0.12, 0.0, 'straight'),
  },

  // ---- Braids: installed / protective ------------------------------------
  // Every row from here to the end of the locs is `anyType()`, and that is the
  // same judgement `box-braids` above already carries rather than a shortcut:
  // an installed style *is* its texture. The braid or the loc is built out of
  // whatever the wearer has and then reads as itself, so there is no type 1
  // version of a knotless braid that differs from the type 4 one. One render
  // each is the honest answer, and it is also why this batch is cheap.
  {
    id: 'knotless-braids',
    name: 'Knotless Braids',
    categoryIds: ['updo', 'long', 'trendy'],
    genders: ['female', 'male'],
    tags: ['protective', 'flat root', 'long lasting'],
    description: 'Braids fed in from your own hair so there is no knot at the root. Lighter and flatter than box braids, and kinder to the hairline.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Heart', 'Square'],
    popularity: 94,
    adjustments: ['length', 'color'],
    variants: anyType(),
    // Braid length is the choice people actually make with this style.
    lengths: len(SML, SML),
    shape: shape(0.22, 0.95, 0.92, 0.18, 'coily', { part: 'middle' }),
  },
  {
    id: 'cornrows',
    name: 'Cornrows',
    categoryIds: ['updo', 'short', 'trendy'],
    genders: ['male', 'female'],
    tags: ['protective', 'flat to the scalp', 'classic'],
    description: 'Braided flat against the scalp in straight rows from the hairline back. Nothing loose and nothing to style.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square', 'Round'],
    popularity: 89,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.1, 0.12, 0.3, 0.05, 'coily', { part: 'middle' }),
  },
  {
    id: 'lemonade-braids',
    name: 'Lemonade Braids',
    categoryIds: ['updo', 'long'],
    genders: ['female'],
    tags: ['protective', 'side swept', 'statement'],
    description: 'Cornrows fed in and swept across to one side, falling long past the shoulder on the way down.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 85,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, ML),
    shape: shape(0.14, 0.7, 0.75, 0.1, 'coily', { part: 'side' }),
  },
  {
    id: 'fulani-braids',
    name: 'Fulani Braids',
    categoryIds: ['updo', 'trendy'],
    genders: ['female'],
    tags: ['protective', 'centre part', 'beads'],
    description: 'A cornrowed centre part with braids dropping either side of the face, finished with beads or cuffs.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Long', 'Heart'],
    popularity: 82,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.18, 0.72, 0.6, 0.12, 'coily', { part: 'middle' }),
  },
  {
    id: 'boho-braids',
    name: 'Boho Knotless Braids',
    categoryIds: ['updo', 'long', 'trendy'],
    genders: ['female'],
    tags: ['protective', 'loose strands', 'soft'],
    description: 'Knotless braids with curly strands left out along their length, so the whole install falls softer than a clean braid.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 87,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, ML),
    shape: shape(0.3, 0.95, 0.88, 0.22, 'curly', { part: 'middle' }),
  },
  {
    id: 'senegalese-twists',
    name: 'Senegalese Twists',
    categoryIds: ['updo', 'long'],
    genders: ['female'],
    tags: ['protective', 'rope twist', 'sleek'],
    description: 'Two strands wound into smooth rope twists. The same install as braids with a glossier finish.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Square'],
    popularity: 80,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, SML),
    shape: shape(0.26, 0.92, 0.88, 0.16, 'curly', { part: 'middle' }),
  },
  {
    id: 'passion-twists',
    name: 'Passion Twists',
    categoryIds: ['updo', 'trendy'],
    genders: ['female'],
    tags: ['protective', 'springy', 'bohemian'],
    description: 'Twists set with wavy hair so they read springy and lived-in rather than smooth.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 84,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, ML),
    shape: shape(0.34, 0.88, 0.78, 0.2, 'coily', { part: 'middle' }),
  },
  {
    id: 'micro-braids',
    name: 'Micro Braids',
    categoryIds: ['updo', 'long'],
    genders: ['female'],
    tags: ['protective', 'fine', 'long lasting'],
    description: 'Hundreds of very fine braids that move almost like loose hair. Long to install and long to keep.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Long', 'Heart'],
    popularity: 71,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, ML),
    shape: shape(0.24, 0.96, 0.9, 0.18, 'straight', { part: 'middle' }),
  },

  // ---- Braids: worn in loose hair -----------------------------------------
  // These four are the arguable ones. The plait itself is constructed and
  // dominates the silhouette, which is what makes `anyType()` right; the halo
  // around it is the wearer's own texture and does not travel. If a render
  // comes back looking wrong for type 4, the fix is
  // `v('straight', 'straight', 'curly', 'coily')` and three more renders — not
  // a change to how this class of style is classified in principle.
  {
    id: 'french-braid',
    name: 'French Braid',
    categoryIds: ['updo'],
    genders: ['female'],
    tags: ['tied back', 'classic', 'quick'],
    description: 'Picked up at the crown and plaited down the back of the head, gathering hair in as it goes.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Heart'],
    popularity: 79,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.18, 0.14, 0.62, 0.06, 'straight', { part: 'middle', tail: true }),
  },
  {
    id: 'dutch-braids',
    name: 'Dutch Braids',
    categoryIds: ['updo', 'trendy'],
    genders: ['female', 'male'],
    tags: ['tied back', 'two braids', 'sporty'],
    description: 'Two braids plaited under rather than over, so they sit raised on the surface either side of a centre part.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square', 'Round'],
    popularity: 76,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.16, 0.2, 0.6, 0.06, 'straight', { part: 'middle', tail: true }),
  },
  {
    id: 'fishtail-braid',
    name: 'Fishtail Braid',
    categoryIds: ['updo', 'long'],
    genders: ['female'],
    tags: ['tied back', 'soft', 'detailed'],
    description: 'Two sections crossed over each other a strand at a time, worn loose over one shoulder.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Heart', 'Long'],
    popularity: 70,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.22, 0.3, 0.7, 0.1, 'wavy', { part: 'side', tail: true }),
  },
  {
    id: 'crown-braid',
    name: 'Crown Braid',
    categoryIds: ['updo'],
    genders: ['female'],
    tags: ['tied back', 'formal', 'off the neck'],
    description: 'A braid taken right around the head and pinned, so the whole length sits up off the neck as a halo.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round', 'Square'],
    popularity: 64,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.3, 0.16, 0.08, 0.08, 'straight', { part: 'middle' }),
  },

  // ---- Locs ----------------------------------------------------------------
  {
    id: 'starter-locs',
    name: 'Starter Locs',
    categoryIds: ['locs', 'short'],
    genders: ['male', 'female'],
    tags: ['comb coils', 'the beginning', 'low profile'],
    description: 'Comb coils or small twists set to lock in. The first months of a loc journey, short and tight to the head.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Round', 'Square'],
    popularity: 74,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.2, 0.14, 0.02, 0.1, 'coily'),
  },
  {
    id: 'traditional-locs',
    name: 'Traditional Locs',
    categoryIds: ['locs', 'long'],
    genders: ['male', 'female'],
    tags: ['mature locs', 'worn down', 'long lasting'],
    description: 'Fully matured locs worn loose, parted in a set grid and retwisted at the root as they grow.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square', 'Round', 'Long'],
    popularity: 88,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(SML, SML),
    shape: shape(0.32, 0.85, 0.85, 0.2, 'coily', { part: 'middle' }),
  },
  {
    id: 'faux-locs',
    name: 'Faux Locs',
    categoryIds: ['locs', 'long', 'trendy'],
    genders: ['female', 'male'],
    tags: ['protective', 'installed', 'no commitment'],
    description: 'Locs wrapped over your own braided hair. The look without the years, and it comes out again.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 86,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(SML, SML),
    shape: shape(0.34, 0.92, 0.9, 0.2, 'coily', { part: 'middle' }),
  },
  {
    id: 'butterfly-locs',
    name: 'Butterfly Locs',
    categoryIds: ['locs', 'trendy'],
    genders: ['female'],
    tags: ['protective', 'distressed', 'textured'],
    description: 'Faux locs left deliberately loopy and distressed along their length, so the finish reads soft rather than smooth.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Round'],
    popularity: 83,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(null, ML),
    shape: shape(0.4, 0.88, 0.75, 0.24, 'coily', { part: 'middle' }),
  },
  {
    id: 'microlocs',
    name: 'Microlocs',
    categoryIds: ['locs', 'long'],
    genders: ['female', 'male'],
    tags: ['fine locs', 'versatile', 'long lasting'],
    description: 'Locs kept deliberately small, so there are many more of them and they move and style closer to loose hair.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Round', 'Heart', 'Square'],
    popularity: 77,
    adjustments: ['length', 'color'],
    variants: anyType(),
    lengths: len(ML, ML),
    shape: shape(0.28, 0.8, 0.72, 0.16, 'coily', { part: 'middle' }),
  },
  {
    id: 'freeform-locs',
    name: 'Freeform Locs',
    categoryIds: ['locs', 'trendy'],
    genders: ['male', 'female'],
    tags: ['no parting', 'natural', 'statement'],
    description: 'Locs left to form on their own with no grid and no retwisting, so they end up uneven, thick and entirely yours.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Square', 'Long'],
    popularity: 69,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.55, 0.7, 0.6, 0.24, 'coily'),
  },
  {
    id: 'loc-taper-fade',
    name: 'Locs with Taper Fade',
    categoryIds: ['locs', 'fades', 'trendy'],
    genders: ['male'],
    tags: ['faded sides', 'sharp', 'barber upkeep'],
    description: 'Locs kept full through the top and back with the sides and neckline tapered down to the skin around them.',
    maintenance: 'Medium',
    bestFor: ['Oval', 'Square', 'Diamond'],
    popularity: 90,
    adjustments: ['fade', 'color'],
    variants: anyType(),
    shape: shape(0.5, 0.08, 0.12, 0.15, 'coily'),
  },
  {
    id: 'loc-bun',
    name: 'Loc Bun',
    categoryIds: ['locs', 'updo', 'medium'],
    genders: ['female', 'male'],
    tags: ['tied back', 'off the neck', 'practical'],
    description: 'Locs gathered up and knotted high at the crown, with the sides pulled clean.',
    maintenance: 'Low',
    bestFor: ['Oval', 'Heart', 'Square'],
    popularity: 78,
    adjustments: ['color'],
    variants: anyType(),
    shape: shape(0.3, 0.28, 0.12, 0.1, 'coily', { knot: true }),
  },
];

const highlights = [
  'Try any hairstyle on your own photo in seconds',
  'Neutral mannequin previews keep the focus on the cut',
  'Adjust length, fade and colour before you commit',
  'Compare before and after side by side',
  'Save the looks you like and take them to your barber',
];

export const mockCatalog: Catalog = {
  categories,
  hairTypes,
  hairLengths,
  colors,
  highlights,
  hairstyles: hairstyles.map((row) => ({ ...row, imageUrl: null })),
};
