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
 * How wide the hero mannequin is drawn, and the number this screen's whole
 * layout is budgeted around.
 *
 * It used to be a flat `width * 0.68`, which on a 414pt phone is a 352pt-tall
 * head: the hero alone took nearly half the viewport, and everything the screen
 * asks the user to *decide* — the texture, the length — started below the fold.
 * A screen whose controls have to be found by scrolling is a screen with one
 * control, and the length slider was the one nobody found.
 *
 * So it is capped by the window's height as well as its width, and the height
 * cap is the one that binds on every phone. The fraction is what is left after
 * the parts that do not scale — the header, the footer's button, the control
 * card — so it is tuned against the smallest screen the app runs on rather than
 * chosen for looks: at 0.29 the second control still clears the fold on a 4.7"
 * phone carrying both of its footnotes. The hero is still the largest thing
 * here by a wide margin; it is simply no longer the only thing.
 */
export const HERO_ART = Math.min(width * 0.56, (height * 0.29) / HEAD_RATIO);
export const THUMB_WIDTH = (width - spacing.xl * 2 - spacing.sm * 3) / 4;
export const THUMB_HEIGHT = THUMB_WIDTH * 0.86 + 18;

/**
 * How tall the hero card is: the art, plus the padding the page holds it in.
 * Mirrors `styles.heroPage` — a head is bottom-aligned in the page with the
 * dots underneath it.
 */
export const HERO_HEIGHT = HERO_ART * HEAD_RATIO + spacing.sm + spacing.xl;
