import { Dimensions } from 'react-native';

import { spacing } from '@/theme/theme';

/**
 * The style screen's geometry, in one place because two screens draw it: the
 * screen itself, and the placeholder it waits behind
 * (`<StyleScreenSkeleton>`). A placeholder built on its own copy of these
 * numbers would be a second answer to the question they exist to settle, and
 * the whole point of the placeholder is that the page does not move when the
 * real thing lands on top of it.
 */
const { width, height } = Dimensions.get('window');
/**
 * One page of the angle pager, so a swipe moves exactly one angle. It is the
 * hero card's *inner* width — the card's own hairline border on each side, or
 * the pages drift out of step with the snap by 2px a page.
 */
export const HERO_PAGE = width - spacing.xl * 2 - 2;
/** The mannequin's box is 200x250, so a head is 1.25x as tall as it is wide. */
export const HEAD_RATIO = 250 / 200;

/**
 * The four angle tiles, which sit directly under the hero and are the only
 * thing saying which page of it you are on.
 *
 * They were 0.86 of their own width plus 18 points of label — a second gallery
 * under the first one. They are a *pager control*: what they have to show is
 * which angle this is and what is on it, and a head at 0.62 does both while
 * costing a third less of the fold than the picture they page.
 */
export const THUMB_WIDTH = (width - spacing.xl * 2 - spacing.sm * 3) / 4;
export const THUMB_HEIGHT = THUMB_WIDTH * 0.62 + 15;

/** The hero card's own padding around the art. Part of the budget below. */
export const HERO_PAD_TOP = spacing.sm;
/**
 * The head is bottom-aligned in its page, so this is all that keeps the jaw off
 * the card's edge. It used to be `xl` because a row of pager dots sat in that
 * space; the dots are gone — the angle tiles below say which page this is, and
 * they say what is on it as well, which a dot cannot.
 */
export const HERO_PAD_BOTTOM = spacing.sm;

/**
 * Everything on this screen that is not the hero, added up.
 *
 * The hero used to be `min(width * 0.56, height * 0.29 / HEAD_RATIO)` — a
 * fraction tuned by hand against one phone and re-tuned every time anything
 * below it changed. The fraction is the wrong control: what this screen owes
 * the user is that the picture, the two adjustments and the button are on one
 * screen, and that is a statement about the *sum*. So the hero is measured as
 * what is left rather than chosen, and the parts that do not scale are listed
 * here where a change to any of them re-budgets the picture on its own.
 *
 * The two insets are assumed at their largest rather than read, because this is
 * a module constant and `useSafeAreaInsets` is a hook — and both screens that
 * draw this geometry need the same answer before they render. 62 is the deepest
 * status area the app runs under (the Pro Max family; a Dynamic Island phone is
 * 59, a notch 47, a flat top 20), so every phone has slack rather than a
 * deficit. Over-assuming is the safe direction and self-correcting where it
 * costs anything: a phone with no notch spends 40 fewer points on its status
 * bar and gets 40 points of unused fold, which is a slightly smaller picture on
 * a small phone rather than a control pushed under the fold on a large one.
 */
const TOP_INSET = 62;
const BOTTOM_INSET = 34;
/** `<Header>`: the inset, its own top pad, the 48pt row, and the step bar. */
const HEADER = TOP_INSET + spacing.sm + 48 + spacing.md + 3;
/**
 * `<ControlCard>` carrying both adjustments — the tallest it gets, so the
 * picture is the same size on every style rather than jumping between a cut
 * that offers lengths and one that does not. Its border and padding, the
 * hair-type row with its footnote, the seam, and the length slider.
 */
const CONTROL_CARD =
  2 + spacing.sm * 2 + (17 + spacing.sm + 44 + spacing.sm + 16) + (spacing.sm * 2 + 1) + (17 + spacing.xs + 30 + 2 + 16);
/** The photo strip: its gap, border, padding and the thumbnail's own height. */
const PHOTO_ROW = spacing.sm + 2 + spacing.md * 2 + 52;
/** `<Screen footer>`: its top pad, the button, and the bottom inset. */
const FOOTER = spacing.md + 56 + Math.max(spacing.lg, BOTTOM_INSET);

const CHROME =
  HEADER +
  // the hero card: its margin off the header, and its padding around the art
  spacing.md +
  HERO_PAD_TOP +
  HERO_PAD_BOTTOM +
  // the angle tiles, immediately under it
  spacing.sm +
  THUMB_HEIGHT +
  // the adjustments, then the photo strip, then the button
  spacing.md +
  CONTROL_CARD +
  PHOTO_ROW +
  FOOTER;

/**
 * Below this the picture stops being the thing the page is about, so a phone
 * too small to hold all of it keeps a legible haircut and lets the photo strip
 * — the one part of the page whose absence the footer button already announces
 * — be what falls under the fold. That is a 4.7" phone and nothing larger.
 */
const MIN_ART = 130;

/** How wide the hero mannequin is drawn: what the budget leaves, within reason. */
export const HERO_ART = Math.max(
  MIN_ART,
  Math.min(width * 0.56, (height - CHROME) / HEAD_RATIO),
);

/**
 * How tall the hero card is: the art, plus the padding the page holds it in.
 * Mirrors `styles.heroPage`.
 */
export const HERO_HEIGHT = HERO_ART * HEAD_RATIO + HERO_PAD_TOP + HERO_PAD_BOTTOM;
