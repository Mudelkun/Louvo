'use client';

/**
 * One hairstyle, in full.
 *
 * The page is arranged around a single fact: the hero plate is the thing the
 * visitor came for, and everything else is a way of interrogating it. So the
 * plate is large, the four angles sit under it as real alternatives rather than
 * as decoration, and the two controls that change what it shows are side by side
 * in one card rather than stacked down the page.
 *
 * ## The hair type control is a chooser, not a caption
 *
 * All four types, every time, in one non-scrolling row — the ones this cut is
 * not offered for held in place as dimmed slots. A row whose length changes per
 * style is a list of what exists; a row that is always the same four is a
 * question with four answers. The app learned this the expensive way: the
 * control was a scrolling chip strip captioned "Shown on", it sat where a
 * gallery's caption sits, and it was read as a label rather than as something to
 * press.
 *
 * The one line under it says the thing the row cannot — that a cut with a single
 * render will not change when the selection moves.
 *
 * ## Length falls back; hair type does not
 *
 * Not an inconsistency: the same rule applied to two different things. A hair
 * type is *declared*, so the wrong texture is a wrong image and drops to the
 * drawing. A length is *asked for*, in a control the user is holding, on a cut
 * whose anchor render they were already looking at — so it falls back to the
 * anchor, and the control says when it did. That line appears per stop and
 * clears itself as renders land, with nothing to remove.
 *
 * ## This is where a preview is generated
 *
 * Not the grid on the home page, and the length control above is the reason. A
 * card there is one three-quarter render with no length, no angles and no
 * texture switch on it, so generating from it would silently send the anchor
 * length every time — a cut somebody could have had short going out at its usual
 * length with nothing on screen having mentioned it. Everything that changes
 * what gets generated is on this page, so the button that spends a credit is
 * too. It is also where somebody arriving from a search result or a shared link
 * lands, which is the other half of why the web exists at all.
 *
 * With no photograph in the session there is nothing to generate *from*, so the
 * action takes one — here, on this page, with the file picker. It used to be a
 * link into the home flow, which asked for the picture and the two questions
 * again and then had to carry the cut and the length back; somebody on this page
 * has already found their haircut, and a dialogue in front of a catalogue is a
 * toll in front of one cut. See the header of `TryOnAction`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type {
  Gender,
  HairColor,
  HairLengthId,
  HairTypeId,
  Hairstyle,
  TextureKind,
  ViewAngle,
} from '../lib/contract/catalog';
import { HAIR_TYPE_IDS, relatedTo, textureFor, typesForVariant, variantCandidates } from '../lib/hairTypes';
import {
  ANGLE_LABELS,
  ANCHOR_LENGTH,
  HERO_ANGLE,
  VIEW_ANGLES,
  renderedVariants,
  resolveRender,
  type ResolvedRender,
} from '../lib/renders';
import { useAccount } from '../lib/state/AccountContext';
import { useCatalog } from '../lib/state/CatalogContext';
import { useGeneration } from '../lib/state/GenerationContext';
import { useAdoptedAnswers, useSession } from '../lib/state/SessionContext';
import { usePhotoIntake } from '../lib/usePhotoIntake';
import { useVariantCycle } from '../lib/useVariantCycle';
import { HAIR_TYPE_SHORT, Plate } from './Plate';
import { SUGGESTION_COUNT, SuggestionShelf } from './SuggestionShelf';
import { ShareButton } from './ShareButton';
import { FavouriteButton } from './FavouriteButton';
import { SignInWall } from './SignInWall';
import { TopUpDialog } from './TopUpDialog';
import { Button, ButtonLink, Chip, Notice, Overline, Rule, Skeleton } from './ui';

/**
 * The four angles, as tiles.
 *
 * One component for both surfaces, because they are one control: on a laptop a
 * tap sets the angle the hero draws, and on a phone it scrolls the deck to that
 * panel. The only difference is `onPick`, so there is no way for the two to
 * drift into offering different views of the same cut.
 *
 * It draws nothing when no angle has a render — four line drawings of a cut that
 * has not been shot are four copies of the picture already above them.
 */
function AngleTiles({
  panels,
  angle,
  style,
  texture,
  color,
  gender,
  onPick,
  className = '',
}: {
  panels: { angle: ViewAngle; render: ResolvedRender | null }[];
  angle: ViewAngle;
  style: Hairstyle;
  texture: TextureKind;
  color: HairColor | null;
  gender: Gender | null;
  onPick: (angle: ViewAngle, index: number) => void;
  className?: string;
}) {
  if (!panels.some((panel) => panel.render)) return null;

  return (
    <div className={`grid grid-cols-4 gap-2 sm:gap-3 ${className}`}>
      {panels.map((panel, index) => (
        <button
          key={panel.angle}
          type="button"
          onClick={() => onPick(panel.angle, index)}
          aria-pressed={angle === panel.angle}
          aria-label={ANGLE_LABELS[panel.angle]}
          className={
            'group overflow-hidden rounded-[14px] bg-plate ring-1 ring-inset transition-[box-shadow] ' +
            'duration-300 ' +
            (angle === panel.angle ? 'ring-2 ring-violet' : 'ring-line hover:ring-white/25')
          }
        >
          <div className="relative aspect-square w-full">
            <Plate
              render={panel.render}
              shape={style.shape}
              texture={texture}
              color={color}
              gender={gender}
              angle={panel.angle}
              alt=""
              className="h-full w-full"
            />
          </div>
          <span
            className={
              'block bg-white px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.07em] ' +
              'sm:pb-1.5 sm:text-[9.5px] sm:tracking-[0.08em] ' +
              (angle === panel.angle ? 'text-on-plate-ink' : 'text-on-plate-muted')
            }
          >
            {ANGLE_LABELS[panel.angle]}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The way back to picking a cut.
 *
 * At the top, where somebody who has looked at this haircut and does not want it
 * reaches for it — the only route back used to be the "All cuts" link beside the
 * related row, which is a scroll past the whole page away.
 *
 * It is a link to `/styles` rather than the browser's own Back, because this
 * page is also where a search result and a shared link arrive and those have
 * nothing behind them. One destination serves both entry points: the catalogue
 * reads the same session answers the flow's chooser does, so a visitor who came
 * through the flow lands on the same cuts, narrowed the same way.
 */
function BackToCatalogue() {
  return (
    <Link
      href="/styles"
      className={
        'mb-3 inline-flex items-center gap-2 rounded-full py-1 pr-3 text-[13px] font-semibold ' +
        'sm:mb-6 ' +
        'text-muted transition-colors hover:text-ink focus-visible:outline-none ' +
        'focus-visible:ring-2 focus-visible:ring-violet'
      }
    >
      <span aria-hidden className="text-[15px] leading-none">
        &larr;
      </span>
      All cuts
    </Link>
  );
}

export function StyleDetail({
  styleId,
  length,
  gender: genderParam,
  hairType: hairTypeParam,
  buy,
}: {
  styleId: string;
  length?: string;
  /** The two answers the grid or the preview that linked here was drawn with. */
  gender?: string;
  hairType?: string;
  /** A pack pressed here before signing in, coming back — see `TryOnAction`. */
  buy?: string;
}) {
  const { catalog, hairstyles, hairTypes, defaultColor, loading, error } = useCatalog();
  const { gender, hairType, hairTypeDeclared, setHairType, setGender } = useSession();

  // Adopted once, before anything is drawn from them — see `useAdoptedAnswers`.
  useAdoptedAnswers({ gender: genderParam, hairType: hairTypeParam });

  const style = catalog?.hairstyles.find((entry) => entry.id === styleId) ?? null;

  // The way back depends on nothing that loads, so it is drawn for real in every
  // state rather than skeletoned in one and missing from the others — a page
  // that could not reach the catalogue is exactly when somebody wants to leave.
  return (
    /*
      One measure for the whole page, and the plate's own width is what sets it.

      The picture column was `1fr`, so capping the plate left the column at its
      old 730px with the picture sitting in a third of it: a 370px hole down the
      middle of the page, and a plate no longer aligned with anything. The fix is
      to make the column *be* the plate — `--plate` is the track width and the
      block inside it is `w-full` — and then to centre the two columns together
      by giving everything above and below them the same width. The back link,
      the rule and the shelf are all inside it, so one left edge runs the length
      of the page and the page itself sits in the middle of the window.

      It is a variable rather than a repeated `clamp` because four places need
      the same number — the two grids, the measure, and `StyleDetailSkeleton`,
      which is a descendant and inherits it — and four copies of one length is
      four chances for the skeleton to draw a different page from the real one.
    */
    <div
      style={
        {
          '--plate': 'clamp(280px, 38svh, 440px)',
          '--measure': 'calc(var(--plate) + 3.5rem + 430px)',
        } as CSSProperties
      }
      className="lg:mx-auto lg:max-w-[var(--measure)]"
    >
      <BackToCatalogue />
      {loading ? (
        <StyleDetailSkeleton />
      ) : error && !catalog ? (
        <Notice tone="error" title="The catalogue could not be reached" body={error.message} />
      ) : !catalog || !style ? (
        <Notice
          title="No such cut"
          body="That hairstyle is not in the catalogue. It may have been renamed or retired."
          action={<ButtonLink href="/styles">Browse the catalogue</ButtonLink>}
        />
      ) : (
        <Loaded
          style={style}
          length={length}
          hairstyles={hairstyles}
          hairTypes={hairTypes}
          manifest={catalog.renders}
          lengths={catalog.hairLengths}
          color={defaultColor}
          gender={gender}
          hairType={hairType}
          hairTypeDeclared={hairTypeDeclared}
          setHairType={setHairType}
          setGender={setGender}
          buy={buy}
        />
      )}
    </div>
  );
}

interface LoadedProps {
  style: Hairstyle;
  /** A length carried in on the url — see the page's own note. */
  length?: string;
  hairstyles: Hairstyle[];
  hairTypes: ReturnType<typeof useCatalog>['hairTypes'];
  manifest: NonNullable<ReturnType<typeof useCatalog>['catalog']>['renders'];
  lengths: NonNullable<ReturnType<typeof useCatalog>['catalog']>['hairLengths'];
  color: ReturnType<typeof useCatalog>['defaultColor'];
  gender: Gender | null;
  hairType: HairTypeId | null;
  hairTypeDeclared: boolean;
  setHairType: (hairType: HairTypeId | null) => void;
  setGender: (gender: Gender | null) => void;
  /** A pack pressed here before signing in, coming back — see `TryOnAction`. */
  buy?: string;
}

function Loaded({
  style,
  length,
  hairstyles,
  hairTypes,
  manifest,
  lengths,
  color,
  gender,
  hairType,
  hairTypeDeclared,
  setHairType,
  setGender,
  buy,
}: LoadedProps) {
  // Read here only to know whether the action below is already asking for a
  // gender — everything else this component draws from is a prop.
  const { photo } = useSession();

  const [angle, setAngle] = useState(HERO_ANGLE);
  const [lengthId, setLengthId] = useState<HairLengthId>(
    length === 'short' || length === 'long' ? length : ANCHOR_LENGTH,
  );

  const candidates = useMemo(() => variantCandidates(style, hairType), [style, hairType]);
  const texture = textureFor(style, hairType);

  /**
   * The lengths this cut is offered at, for this gender.
   *
   * Per gender because the men's and women's readings of one cut do not travel
   * the same distance. Most of the catalogue has no row at all — a fade's
   * variable is its fade height, and a Caesar cut that got longer would stop
   * being one — so most styles show no slider.
   */
  const offered = useMemo(() => {
    const ids = (gender && style.lengths?.[gender]) || style.lengths?.male || style.lengths?.female;
    if (!ids || ids.length < 2) return null;
    return lengths.filter((entry) => ids.includes(entry.id)).sort((a, b) => a.order - b.order);
  }, [style.lengths, gender, lengths]);

  const hero = useMemo(
    () => renderedVariants(manifest, { styleId: style.id, gender, angle, variants: candidates, length: lengthId }),
    [manifest, style.id, gender, angle, candidates, lengthId],
  );

  // The cycle runs only while nothing has been declared — a choice outranks a
  // demonstration, so pressing a hair type stops it.
  const cycleIndex = useVariantCycle(hairTypeDeclared && hairType ? 1 : hero.length);
  const current =
    hero[cycleIndex] ??
    resolveRender(manifest, { styleId: style.id, gender, angle, variants: candidates, length: lengthId });

  /**
   * Which length actually arrived, and whether it is the one asked for.
   *
   * The honest half of the slider: a stop whose render has not been generated
   * resolves to the anchor, and the control says so instead of silently showing
   * the same picture at three settings.
   */
  const gotLength = current?.length ?? null;
  const lengthMissing = !!offered && gotLength !== null && gotLength !== lengthId;

  const views = useMemo(
    () =>
      VIEW_ANGLES.map((entry) => ({
        angle: entry,
        render: current
          ? resolveRender(manifest, {
              styleId: style.id,
              gender: current.gender,
              angle: entry,
              variants: [current.variant],
              length: current.length,
            })
          : null,
      })),
    [manifest, style.id, current],
  );

  /**
   * Every angle, in every texture this cut has been shot in — the four panels of
   * the phone's swipe deck.
   *
   * Two things about how it is built are load-bearing.
   *
   * **It is anchored on one variant list rather than resolved per angle.** The
   * textures are listed once, at the hero angle, and each panel is that same
   * list resolved at its own angle. Listing them per angle independently would
   * let a partially shot cut put its curly front next to its coily back, and a
   * deck somebody swipes through is exactly where that reads as two haircuts —
   * it is the same rule `views` follows for the thumbnails, applied to a control
   * that has all four pictures loaded at once.
   *
   * **It does not depend on `angle`.** Swiping sets the angle, and if the panels
   * were derived from it every swipe would rebuild all four. They are stable, so
   * a swipe moves the scroller and nothing else.
   */
  const shotIn = useMemo(
    () =>
      renderedVariants(manifest, {
        styleId: style.id,
        gender,
        angle: HERO_ANGLE,
        variants: candidates,
        length: lengthId,
      }),
    [manifest, style.id, gender, candidates, lengthId],
  );

  const deck = useMemo(
    () =>
      VIEW_ANGLES.map((entry) => ({
        angle: entry,
        renders: shotIn
          .map((variant) =>
            resolveRender(manifest, {
              styleId: style.id,
              gender: variant.gender,
              angle: entry,
              variants: [variant.variant],
              length: variant.length,
            }),
          )
          .filter((resolved): resolved is ResolvedRender => resolved !== null),
      })),
    [manifest, style.id, shotIn],
  );

  /**
   * The deck's four panels reduced to the one render each is showing, which is
   * what the tiles under it draw.
   *
   * Taken from the deck rather than from `views` so the tile and the panel it
   * pages to are the same picture — two derivations of "the current render"
   * would disagree the moment a cut's angles are unevenly shot.
   */
  const tiles = useMemo(
    () =>
      deck.map((panel) => ({
        angle: panel.angle,
        render: panel.renders.length
          ? (panel.renders[cycleIndex % panel.renders.length] ?? null)
          : null,
      })),
    [deck, cycleIndex],
  );

  /**
   * The deck's scroller, and the two directions it is driven in.
   *
   * A swipe is the input; the dots are a second way to reach the same panel, and
   * a way to *see* that there are four. The angle the page holds follows the
   * scroll rather than leading it, so the label under the plate always names the
   * picture that is actually on screen — including mid-flick, where a state that
   * led the scroll would name the panel being left.
   */
  const scroller = useRef<HTMLDivElement>(null);

  // The deck opens on the three-quarter view, which is the second panel — the
  // one that stands for the cut everywhere else on the site.
  useEffect(() => {
    const node = scroller.current;
    if (!node || node.clientWidth === 0) return;
    node.scrollLeft = node.clientWidth * VIEW_ANGLES.indexOf(HERO_ANGLE);
  }, []);

  const onDeckScroll = useCallback(() => {
    const node = scroller.current;
    if (!node || node.clientWidth === 0) return;
    const index = Math.round(node.scrollLeft / node.clientWidth);
    const next = VIEW_ANGLES[Math.min(Math.max(index, 0), VIEW_ANGLES.length - 1)];
    if (next) setAngle((held) => (held === next ? held : next));
  }, []);

  const swipeTo = (index: number) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ left: node.clientWidth * index, behavior: 'smooth' });
  };

  const related = useMemo(
    () => relatedTo(hairstyles, style.id, gender, hairType, SUGGESTION_COUNT),
    [hairstyles, style.id, gender, hairType],
  );

  const notOfferedHere = hairType && !style.variants[hairType];

  return (
    <>
      {/*
        Two columns on a laptop; on a phone one column whose pieces interleave.

        The wrappers dissolve into the parent (`contents`) below `lg` so
        `order-*` can lift the cut's name above the plate and put the two
        adjustments directly beneath it. One DOM, two arrangements, and no second
        copy of a control to fall out of step with the first.
      */}
      <div
        className={
          'flex flex-col gap-5 sm:gap-6 ' +
          // The picture column is the plate's own width — see `--plate` above.
          'lg:grid lg:gap-14 lg:grid-cols-[var(--plate)_minmax(0,430px)]'
        }
      >
        {/* ------------------------------------------------------------ */}
        {/* The plate                                                     */}
        {/* ------------------------------------------------------------ */}
        <div className="contents lg:block">
          {/*
            On a phone the plate is a deck you swipe.

            The four angles were four thumbnails under the picture, which is a
            fine control with a mouse and a poor one with a thumb: the tiles are
            small, they sit below the plate rather than on it, and tapping one is
            a deliberate act somebody has to first work out is available. A
            haircut has a back, and *what does the back look like* is the second
            question anybody asks about one — so on a phone the picture itself is
            the control, and the gesture is the one every photograph on the
            device already answers to.

            Scroll snapping rather than a hand-written pan: it is the browser's
            own paging, so momentum, rubber-banding and the platform's pointer
            behaviour come for free, and it keeps working with a trackpad and
            with a keyboard on the scroller. The dots are the other half of it —
            they say there are four, which a deck on its own cannot, and they are
            how somebody reaches the back view without four swipes.
          */}
          <div className="order-2 lg:hidden">
            <div
              className={
                'relative overflow-hidden rounded-[24px] bg-plate ring-1 ring-inset ring-white/10 ' +
                'shadow-[0_40px_90px_-45px_rgb(0_0_0/0.95)]'
              }
            >
              <div
                ref={scroller}
                onScroll={onDeckScroll}
                role="group"
                aria-roledescription="carousel"
                aria-label={`${style.name}, four views — swipe sideways`}
                className={
                  'no-scrollbar flex h-[36svh] max-h-[340px] min-h-[216px] snap-x snap-mandatory ' +
                  'overflow-x-auto overscroll-x-contain'
                }
              >
                {deck.map((panel) => (
                  <div
                    key={panel.angle}
                    className="relative h-full w-full shrink-0 snap-center"
                    aria-label={ANGLE_LABELS[panel.angle]}
                  >
                    {/* Stacked and cross-faded on the page's own beat, exactly
                        as the laptop's hero is: a cut shot in more than one
                        texture must not hard-cut between them at full width. */}
                    {panel.renders.length > 1 ? (
                      panel.renders.map((entry, index) => (
                        <div
                          key={entry.ref.url}
                          className="absolute inset-0 transition-opacity duration-[900ms] ease-in-out"
                          style={{ opacity: index === cycleIndex % panel.renders.length ? 1 : 0 }}
                        >
                          <Plate
                            render={entry}
                            shape={style.shape}
                            texture={texture}
                            color={color}
                            gender={gender}
                            angle={panel.angle}
                            alt={`${style.name}, ${ANGLE_LABELS[panel.angle].toLowerCase()}`}
                            priority={panel.angle === HERO_ANGLE && index === 0}
                            className="h-full w-full"
                          />
                        </div>
                      ))
                    ) : (
                      <Plate
                        render={panel.renders[0] ?? null}
                        shape={style.shape}
                        texture={texture}
                        color={color}
                        gender={gender}
                        angle={panel.angle}
                        alt={`${style.name}, ${ANGLE_LABELS[panel.angle].toLowerCase()}`}
                        priority={panel.angle === HERO_ANGLE}
                        className="h-full w-full"
                      />
                    )}
                  </div>
                ))}
              </div>

              {!current ? (
                <span
                  className={
                    'absolute right-4 top-4 rounded-full bg-white/85 px-3 py-1.5 text-[10.5px] ' +
                    'font-bold uppercase tracking-[0.1em] text-on-plate-muted'
                  }
                >
                  Illustrated &mdash; render coming
                </span>
              ) : null}
            </div>

            {/*
              The four tiles, under the deck, exactly as on a laptop.

              They were four dots at first, on the reasoning that a deck you
              swipe does not need a second way to page it and dots are the
              cheapest possible "there are four of these". Both halves were
              wrong. A dot says a panel exists and nothing about what is on it,
              so *what does the back look like* still costs three swipes and a
              guess — and a swipe is invisible until somebody tries it, which
              means a visitor who never thinks to try has no way at all. Tiles
              answer the question by being the answer, and they are the control
              a tap goes to when swiping does not occur to somebody.

              Tapping one scrolls the deck rather than setting the angle: the
              angle follows the scroller, so one thing drives it in both
              directions and a tap gets the same snap a swipe does.
            */}
            <AngleTiles
              panels={tiles}
              angle={angle}
              style={style}
              texture={texture}
              color={color}
              gender={gender}
              onPick={(_view, index) => swipeTo(index)}
              className="mt-3"
            />
          </div>

          {/*
            The laptop's plate, with the four angles under it as tiles.

            It fills its column and the *column* is capped by the window's
            height, which is the whole reason this page fits on one screen. A
            square plate across a 730px column is a 730px picture, and under it
            four tiles, a rule and a heading — so the shelf of what to try next
            began below the fold on every laptop, which is exactly where a
            suggestion goes unread. Nothing is gained by the extra 300px: the
            subject is one head on a white ground and it is already the largest
            thing on the page by a wide margin at 38svh.

            The cap is a `clamp` rather than a fraction so it degrades in both
            directions — a floor for a short window, a ceiling so a tall desktop
            does not go back to a picture that outruns the column beside it — and
            it is the grid track rather than this block, so the tiles beneath
            take the plate's width for free and the column has no width left over
            to sit the picture in the middle of.
          */}
          <div className="hidden lg:block">
            <div
              className={
                'relative overflow-hidden rounded-[24px] bg-plate ring-1 ring-inset ring-white/10 ' +
                'shadow-[0_40px_90px_-45px_rgb(0_0_0/0.95)]'
              }
            >
              <div className="relative aspect-[4/5] w-full sm:aspect-[5/5]">
                {hero.length > 1 && !(hairTypeDeclared && hairType) ? (
                  hero.map((entry, index) => (
                    <div
                      key={entry.ref.url}
                      className="absolute inset-0 transition-opacity duration-[900ms] ease-in-out"
                      style={{ opacity: index === cycleIndex ? 1 : 0 }}
                    >
                      <Plate
                        render={entry}
                        shape={style.shape}
                        texture={texture}
                        color={color}
                        gender={gender}
                        angle={angle}
                        alt={`${style.name}, ${ANGLE_LABELS[angle].toLowerCase()}`}
                        priority={index === 0}
                        className="h-full w-full"
                      />
                    </div>
                  ))
                ) : (
                  <Plate
                    render={current}
                    shape={style.shape}
                    texture={texture}
                    color={color}
                    gender={gender}
                    angle={angle}
                    alt={`${style.name}, ${ANGLE_LABELS[angle].toLowerCase()}`}
                    priority
                    className="h-full w-full"
                  />
                )}

                {!current ? (
                  <span
                    className={
                      'absolute right-4 top-4 rounded-full bg-white/85 px-3 py-1.5 text-[10.5px] ' +
                      'font-bold uppercase tracking-[0.1em] text-on-plate-muted'
                    }
                  >
                    Illustrated — render coming
                  </span>
                ) : null}
              </div>
            </div>

            {/* Angles. The same tiles the deck has, driving the hero instead. */}
            <AngleTiles
              panels={views}
              angle={angle}
              style={style}
              texture={texture}
              color={color}
              gender={gender}
              onPick={(view) => setAngle(view)}
              className="mt-4"
            />
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* The detail                                                    */}
        {/* ------------------------------------------------------------ */}
        <div className="contents lg:block lg:sticky lg:top-[92px] lg:self-start">
          <div className="order-1 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Overline>{style.maintenance} upkeep</Overline>
              <h1 className="mt-1.5 font-display text-[clamp(2.1rem,4.6vw,3rem)] leading-[1.02] tracking-[-0.02em] sm:mt-2.5">
                {style.name}
              </h1>
            </div>
            <FavouriteButton styleId={style.id} styleName={style.name} />
          </div>

          {/*
            The cut's own prose is not on this page, and the picture is the
            argument for that.

            It was a paragraph of description, a "Suits" line and a tag row,
            moved below the controls on a phone because 200 points of reading
            between the deck and the two controls that change it put the length
            slider off the bottom of the screen. Moving it was the right fix for
            the fold and the wrong answer to what the block was for: a studio
            render of the cut at four angles, in the visitor's own texture, says
            more about what a Messy Fringe is than three sentences do — and what
            somebody on this page is deciding is whether to spend a credit
            putting it on their own face, which no adjective moves. The name, the
            upkeep line and the picture are what that decision is made on.

            None of it is deleted, only un-drawn here: a card in the catalogue
            still captions itself with the cut's first tag, `searchStyles` still
            matches on the description, and the result page keeps "About this
            cut" — there the picture is of the *visitor*, so the prose is the
            only thing on screen naming what was done to them.
          */}

          {/* ---------------------------------------------------------- */}
          {/* The controls, in one card                                   */}
          {/* ---------------------------------------------------------- */}
          {/*
            Directly under the deck on a phone, which is now simply where they
            fall — the 200 points of prose that used to sit between them and the
            picture is gone from the page rather than reordered around them.

            Both controls change the picture, and a control whose effect is off
            the top of the screen is a control nobody can judge — the hair type
            row moved the plate through three textures and the length segmented
            swapped the cut for a shorter one, both while the only evidence for
            either was scrolled away. Together with the deck's capped height,
            picture and controls now land on one screen, so a tap on `Coily` is
            answered in view.
          */}
          <div className="order-3 overflow-hidden rounded-[20px] bg-surface/60 ring-1 ring-inset ring-line lg:mt-7">
            <div className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[14px] font-bold text-ink">Hair type</h2>
                <span className="text-[12px] text-muted">Pick yours</span>
              </div>

              {/*
                The name, with the tier under it.

                "Type 1" is a number, not an answer: somebody who has never read
                the Andre Walker chart cannot pick from four of them, and the one
                thing they do know about their own hair is whether it is straight
                or curly. So the catalogue's `name` leads and its `tier` is the
                second line, for anybody who does think in numbers — the same
                pairing the setup dialogue uses, so the two places this question
                is asked read alike.

                Both strings come from `catalog.hairTypes`. No hair type is named
                in this file, which is the constraint the whole catalogue is
                built on.
              */}
              <div className="mt-3.5 grid grid-cols-4 gap-2">
                {HAIR_TYPE_IDS.map((type) => {
                  const offeredHere = style.variants[type] != null;
                  const active = hairTypeDeclared && hairType === type;
                  const entry = hairTypes.find((row) => row.id === type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={!offeredHere}
                      onClick={() => setHairType(type)}
                      aria-pressed={active}
                      className={
                        'rounded-[14px] px-1 py-1.5 transition-colors duration-200 ' +
                        'ring-1 ring-inset ' +
                        (!offeredHere
                          ? 'cursor-not-allowed border-dashed text-faint ring-line opacity-55'
                          : active
                            ? 'bg-violet/18 text-violet-ink ring-violet/45'
                            : 'bg-white/4 text-ink-soft ring-line hover:bg-white/8 hover:text-ink')
                      }
                      title={
                        offeredHere
                          ? entry?.description
                          : `${style.name} is not offered for this texture`
                      }
                    >
                      <span className="block truncate text-[12.5px] font-semibold">
                        {entry?.name ?? HAIR_TYPE_SHORT[type]}
                      </span>
                      <span className="block truncate text-[10.5px] font-medium opacity-70">
                        {entry?.tier ?? HAIR_TYPE_SHORT[type]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Three cases, not two. The row cannot say any of them itself,
                  which is the whole reason this line exists — and a cut with no
                  render at all must not be described as having one. */}
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                {hero.length > 1
                  ? 'This cut is shot in more than one texture — the picture changes with your choice.'
                  : hero.length === 1
                    ? 'This cut has one render, so the picture will not change when the selection moves.'
                    : 'This cut has not been shot yet, so what you see is an illustration. Your choice still decides which version is generated.'}
              </p>

              {hairTypeDeclared ? (
                <button
                  type="button"
                  onClick={() => setHairType(null)}
                  className="mt-2.5 text-[12px] font-semibold text-violet-ink underline underline-offset-4"
                >
                  Show all textures
                </button>
              ) : null}
            </div>

            {/* Length. Absent entirely for a cut that is not offered at more
                than one, which is most of the catalogue. */}
            {offered ? (
              <>
                <div aria-hidden className="h-px w-full bg-line" />
                <div className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[14px] font-bold text-ink">Hair Length</h2>
                    <span className="text-[12px] text-muted">Drag to try</span>
                  </div>

                  <div className="mt-3.5 flex rounded-full bg-white/5 p-1 ring-1 ring-inset ring-line">
                    {offered.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setLengthId(entry.id)}
                        aria-pressed={lengthId === entry.id}
                        title={entry.description}
                        className={
                          'flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-colors duration-200 ' +
                          (lengthId === entry.id ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')
                        }
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>

                  {lengthMissing ? (
                    <p className="mt-3 text-[12px] leading-relaxed text-amber">
                      That length has not been shot yet — this is the cut at its usual length.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {notOfferedHere ? (
            <p className="order-4 rounded-[16px] bg-amber/10 px-4 py-3 text-[13px] leading-relaxed text-amber ring-1 ring-inset ring-amber/25 lg:mt-5">
              This cut is not offered for the texture you have selected, so what you are seeing
              is an illustration rather than a studio render.
            </p>
          ) : null}

          {/* ---------------------------------------------------------- */}
          {/* The action                                                  */}
          {/* ---------------------------------------------------------- */}
          <div className="order-5 lg:contents">
            <TryOnAction
              style={style}
              gender={gender}
              hairType={hairType}
              lengthId={lengthId}
              notOffered={!!notOfferedHere}
              setGender={setGender}
              buy={buy}
              share={
                <ShareButton
                  hairstyleId={style.id}
                  hairstyleName={style.name}
                  gender={gender}
                  hairType={hairType}
                  lengthId={lengthId}
                />
              }
            />
          </div>

          {/* The same answer the action asks for, worded as what it changes on
              screen rather than as what it unlocks — and drawn only while there
              is no photograph, because from the moment there is one the action
              above asks it directly. Two live controls for one answer, six
              inches apart, is the "two places to change one thing" the summary
              row on the home page was cut for. */}
          {!gender && !photo ? (
            <p className="order-7 text-[12.5px] text-muted lg:mt-4">
              Showing every version of this cut.{' '}
              <button
                type="button"
                onClick={() => setGender('male')}
                className="font-semibold text-violet-ink underline underline-offset-4"
              >
                Men&rsquo;s
              </button>{' '}
              or{' '}
              <button
                type="button"
                onClick={() => setGender('female')}
                className="font-semibold text-violet-ink underline underline-offset-4"
              >
                women&rsquo;s
              </button>
              ?
            </p>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Related                                                         */}
      {/* -------------------------------------------------------------- */}
      {/*
        The same shelf the finished preview offers, and deliberately the same
        object: `<SuggestionShelf>` draws the heading and the drifting row at
        every width, so the two places the catalogue says "and then?" say it in
        one voice. This page owns only the frame: a rule, and the space to
        put it below the fold. There is no sentence under the heading here
        because the button above it has already said what a preview costs.

        That space was 96px above the rule and 48px below it, which on a laptop
        left most of a screen of nothing between the button and the next
        heading — the two-column grid is as tall as the plate, and the action
        column ends well above it. A rule already separates the two sections;
        the gap only has to say they are separate, not hide one from the other.
      */}
      {related.length ? (
        <div className="mt-10 sm:mt-12 lg:mt-9">
          <Rule />
          <SuggestionShelf
            className="mt-7 sm:mt-8 lg:mt-6"
            title="In the same direction"
            styles={related}
            hairTypes={hairTypes}
            manifest={manifest}
            gender={gender}
            hairType={hairType}
            color={color}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * The page's placeholder, stating the layout and nothing about the cut.
 *
 * A plate, four angle tiles, an overline, a title, one control card and the
 * button — all facts about the screen. There is no paragraph in it because
 * there is no paragraph on the page any more: a placeholder standing in for
 * three lines of prose that never arrive is the layout lying about itself, and
 * the page would jump by exactly those three lines when the catalogue landed.
 */
/**
 * The button that spends a credit, and the three states it is honestly in.
 *
 * **With a photograph and a gender**, it generates: the cut on this page, at the
 * length and texture this page is showing, submitted as a job.
 *
 * **Without a photograph** it takes one, *here*. It used to be a link into the
 * home flow, which asked for the picture and then raised the two questions and
 * then had to carry the cut and the length back so the round trip ended on this
 * page rather than on a grid. That was three screens of machinery in service of
 * a visitor who had already done the hard part — they had found their haircut.
 * A dialogue that narrows a catalogue is worth having in front of a catalogue;
 * in front of one cut somebody is already looking at, it is a toll. So the
 * button opens the file picker and the page does not move: the photograph lands
 * in the session, the thumbnail appears above the button, and the button becomes
 * *Generate my preview* with the length, the texture and the angle exactly as
 * they were left.
 *
 * **Without a gender** it asks that one question, in place, as two buttons. It
 * is the one answer that cannot be skipped or defaulted — men's and women's cuts
 * are shot separately, so it decides which render exists — where hair type has
 * *all textures* as a real answer and its own control further up this page.
 * Asking it here rather than sending somebody to the dialogue is the same
 * argument as the paragraph above, and it is one tap rather than a navigation.
 *
 * Three rules carried over from the flow and worth not re-deriving:
 *
 * - **The client never adjusts a balance locally.** Submitting *holds* a credit
 *   server-side, so the number is stale from that moment; asking the server is
 *   the fix and subtracting one here is not. The balance moves without this tab
 *   being involved — another device, a refund, a refunded failure.
 * - **`ready: false` is not "no credits".** `canGenerate` is true while the
 *   balance is loading, because a paywall that flashes on a cold start lands on
 *   people who have twenty.
 * - **A cut not offered for the declared texture is not generated.** What is on
 *   screen in that case is an illustration, and generating from it would be the
 *   wrong-image failure the whole variant system exists to prevent.
 *
 * And one that is not carried over, because it was wrong here: **an empty
 * balance does not change the button.** It used to become *Top up to keep going*
 * pointing at `/account`, which answers somebody's intention with a different
 * verb and a navigation — the cut, the length and the texture left behind, and
 * the way back is finding this page again. The label is the same at every
 * balance and the dialogue is raised over the page instead; the line under the
 * button is where "none left" is said.
 *
 * ## An empty balance is two states, and they get two dialogues
 *
 * **Signed in and out of previews** is the packs (`<TopUpDialog>`). **Never
 * signed in** is `<SignInWall>`, and it is not a softer paywall — it is the only
 * one of the two that is not a dead end. Credits live on an account, so
 * `<Pricing>` sends a signed-out Buy to `/sign-in` anyway: showing the packs
 * first puts three prices in front of somebody whose every next step is the page
 * behind them. And a first sign-in carries `grantSignupBonus`, so the visitor
 * who does what that dialogue asks can generate again without paying — which is
 * why the wall offers more hairstyles and never names the bonus. The condition
 * is read at press time from the same account state the button is refused on, so
 * a sign-in that happens in another tab is reflected the next time it is
 * pressed.
 *
 * ## Coming back from sign-in with a pack still in hand
 *
 * Credits live on an account, so pressing Buy in that dialogue while signed out
 * goes to `/sign-in` carrying the pack — `?buy=<product>` on the path handed
 * over as `next` (see `<Pricing>`). What comes back is *this* page, and the
 * dialogue that raised the question is not on it any more: `<Pricing>` owns the
 * resume and `<Pricing>` is inside the dialogue, so with it closed the pack
 * arrives at a page with nothing mounted to notice it. So `buy` opens the
 * dialogue on the way in, over the cut the visitor was standing on, and
 * `<Pricing>` picks up from there — one interruption, ending on Stripe's page
 * with the pack that was pressed, rather than a second attempt.
 */
function TryOnAction({
  style,
  gender,
  hairType,
  lengthId,
  notOffered,
  setGender,
  buy,
  share,
}: {
  style: Hairstyle;
  gender: Gender | null;
  hairType: HairTypeId | null;
  lengthId: HairLengthId;
  notOffered: boolean;
  setGender: (gender: Gender | null) => void;
  /** A pack pressed here before signing in, coming back — see the header. */
  buy?: string;
  share: ReactNode;
}) {
  const router = useRouter();
  const { photo } = useSession();
  const { start, starting, error } = useGeneration();
  const { credits, ready, canGenerate, refresh } = useAccount();

  /** The same intake the hero's drop box uses — see `usePhotoIntake`. */
  const { choose, busy, error: photoError, inputProps } = usePhotoIntake();

  /**
   * The packs, raised by the button rather than linked to. See `TopUpDialog`.
   *
   * Open from the first render when a pack came back on the url, so the resume
   * inside `<Pricing>` has something to run in — the header has the why. An
   * initial state rather than an effect: the parameter is handed down by the
   * server component, so both renders agree and the dialogue is never drawn
   * shut for a frame first.
   */
  const [wall, setWall] = useState<'packs' | 'sign-in' | null>(buy ? 'packs' : null);

  const submit = async () => {
    if (!photo || !gender || notOffered) return;
    // The paywall is raised here rather than in the label. The button says what
    // it does at every balance, and with nothing to spend the first thing it
    // does is ask for whichever of the two things is actually missing — an
    // account, or a pack — over this page, so the cut, the length and the
    // texture survive the interruption. See the header.
    if (!canGenerate) {
      setWall(credits.signedIn ? 'packs' : 'sign-in');
      return;
    }
    const id = await start({ hairstyle: style, gender, hairType, lengthId, photo });
    if (!id) return;
    // Re-read the balance, never decrement it — see the header.
    void refresh();
    router.push('/studio/generating');
  };

  // A pack bought in another tab, or credits granted by a sign-in that happened
  // while this was open, land here — the client never adjusts a balance itself,
  // so asking the server is the only way this button becomes live again.
  const closeWall = () => {
    setWall(null);
    void refresh();
  };

  return (
    <>
      {/* Rendered once, for the first photograph and every replacement alike. */}
      <input {...inputProps} />

      {/* The photograph the button is about, shown next to it.
          Somebody arriving here from a search result or a shared link has a
          photo in the session from earlier in the visit and nothing on this page
          said which one — and "generate my preview" is a request to put this cut
          on *that* face. A visitor trying a cut on a friend's picture, or coming
          back to a second one, would otherwise spend a credit before finding out
          which photograph the session was still holding. It is a thumbnail
          rather than a panel because it is a confirmation, not the subject; the
          control beside it opens the picker again, on this page, for the reason
          the header gives. */}
      {photo ? (
        <div className="mt-7 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-surface ring-1 ring-inset ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.objectUrl} alt="The photo this preview will be made from" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-ink-soft">Your photo</p>
            <button
              type="button"
              onClick={choose}
              disabled={busy}
              className="text-[12.5px] text-muted underline underline-offset-4 transition-colors hover:text-ink-soft disabled:opacity-60"
            >
              {busy ? 'Reading your photo…' : 'Use a different one'}
            </button>
          </div>
        </div>
      ) : null}

      {/* The one answer that has to exist before a render does, asked where it
          is needed rather than in a dialogue on another page. */}
      {photo && !gender ? (
        <p className="mt-6 text-[13.5px] font-medium text-ink-soft">Whose version of this cut?</p>
      ) : null}

      <div className={(!photo ? 'mt-7' : !gender ? 'mt-3' : 'mt-4') + ' flex flex-wrap gap-3'}>
        {!photo ? (
          <Button size="lg" className="flex-1 sm:flex-none" loading={busy} onClick={choose}>
            {busy ? 'Reading your photo…' : 'Add your photo to try this on'}
          </Button>
        ) : !gender ? (
          /* Two equal answers, so neither of them is the primary button.
             Pressing one writes the session's gender, which is what this whole
             page is already drawn from — the hero, the angle tiles and the
             length row all move with it — and this row becomes the generate
             button in place. */
          <>
            <Button
              size="lg"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => setGender('male')}
            >
              Men&rsquo;s
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => setGender('female')}
            >
              Women&rsquo;s
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            className="flex-1 sm:flex-none"
            disabled={notOffered}
            loading={starting}
            onClick={() => void submit()}
          >
            {starting ? 'Sending…' : 'Generate my preview'}
          </Button>
        )}
        {share}
      </div>

      {!photo ? (
        <p className="mt-3 text-[12.5px] text-muted">
          One photo, then this cut on it — about forty seconds. Two previews are free.
        </p>
      ) : !gender ? (
        <p className="mt-3 text-[12.5px] text-muted">
          Men&rsquo;s and women&rsquo;s cuts are shot separately, so this picks the render your
          preview is made from.
        </p>
      ) : ready && canGenerate ? (
        <p className="mt-3 text-[12.5px] text-muted">
          <span className="tnum font-semibold text-ink-soft">{credits.total}</span>{' '}
          {credits.total === 1 ? 'preview' : 'previews'} left
          {credits.free > 0 ? ` · ${credits.free} free` : ''} · about forty seconds
        </p>
      ) : ready ? (
        /* The balance is empty, and the line under the button is where that is
           said — not on the button, which still names the thing being asked for.
           This is the sentence that means the dialogue is not a surprise, so it
           has to name the dialogue that is actually coming: the packs for
           somebody with an account, and sign-in for somebody without one. */
        <p className="mt-3 text-[12.5px] text-muted">
          No previews left ·{' '}
          {credits.signedIn ? 'Generate opens the packs' : 'sign in to keep generating'}
        </p>
      ) : null}

      {photoError ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {photoError}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error.message}
        </p>
      ) : null}

      {wall === 'packs' ? (
        <TopUpDialog onClose={closeWall} />
      ) : wall === 'sign-in' ? (
        <SignInWall onClose={closeWall} />
      ) : null}
    </>
  );
}

function StyleDetailSkeleton() {
  return (
    /* `--plate` is inherited from the page's own wrapper, so the placeholder is
       laid out on exactly the measure the catalogue will land in and the page
       does not jump by 300px when it does. */
    <div className="grid gap-10 lg:grid-cols-[var(--plate)_minmax(0,430px)] lg:gap-14">
      <div>
        <Skeleton className="aspect-[4/5] w-full rounded-[24px] sm:aspect-[5/5]" />
        <div className="mt-4 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-[14px]" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-7 h-[168px] w-full rounded-[20px]" />
        <Skeleton className="mt-7 h-13 w-52 rounded-full" />
      </div>
    </div>
  );
}
