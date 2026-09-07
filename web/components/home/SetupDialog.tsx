'use client';

/**
 * The two questions, asked on every upload, right after the photograph.
 *
 * The app asks these *before* the photo, because on a phone the first run is
 * somebody's introduction to the whole product and a face handed over before
 * anything has been explained is work done for no stated reason
 * (`docs/onboarding.md`). The web is entered the other way round: the thing a
 * visitor came here to do is try a haircut on, so the photograph is the first
 * move and these two follow it immediately — at the moment they start to matter,
 * which is the moment a catalogue has to be narrowed.
 *
 * ## Every upload, not once per visitor
 *
 * Because both answers are about the person in the *picture*, not about the
 * person at the keyboard. A stored answer is only good for the photograph it was
 * given about, so somebody trying a cut on a friend — or coming back for a
 * different face — would otherwise be silently browsing the wrong catalogue,
 * with the controls a chip row away, which is precisely where nobody looks while
 * nothing appears to be wrong. `TryOnFlow`'s `answeredFor` is the mechanism.
 *
 * ## Nothing arrives pre-selected
 *
 * Not even for somebody who answered yesterday, and that follows from the
 * paragraph above rather than contradicting it. If the answers belong to the
 * *photograph*, then last visit's answer is a fact about a different picture,
 * and showing it lit is this screen making a guess about a face it has not seen.
 * A lit tile is also the easiest thing in the world to tap past without reading,
 * which is precisely how somebody ends up browsing the wrong catalogue while
 * believing they chose it.
 *
 * So both rows start blank every time. The session still remembers — the chips
 * after the dialogue show the answer, the catalogue is narrowed by it — but this
 * screen asks rather than proposes.
 *
 * ## Neither question is illustrated with a catalogue render, and both were
 *
 * They were, and each failed in its own way.
 *
 * **Gender** was two mannequin plates — the most popular men's cut beside the
 * most popular women's cut. But it asks *whose catalogue*, which is a category,
 * and two haircuts side by side is an invitation to compare them *as haircuts*:
 * the visitor reads "do I want this crop or this lob" and answers a question
 * nobody asked. So it is the two gender signs, blue and pink, which is the one
 * convention on earth that needs no label at all — and they cost nothing to
 * draw, so the first question renders instantly instead of waiting on a fetch.
 *
 * The blue is the only one in the product and it is `--color-azure`, added for
 * this control and nothing else; `app/globals.css` has the argument. Two tiles
 * in one violet would read as one thing offered twice, which is the same mistake
 * as two haircuts, made with colour instead.
 *
 * **Hair type** was worse, and it was wrong rather than merely off. The tile
 * picked the most popular cut offered for each type and drew it in that type's
 * texture — but the most popular cut is usually the *same* cut for all four, so
 * the row came back as one haircut four times with a curl difference too small
 * to see. The question "what does your hair do" was being illustrated with four
 * pictures of a haircut.
 *
 * The right image already exists. `scripts/generate-hair-type-examples.mjs`
 * makes one set per gender in which the subject *is* the texture — the same
 * plain hair on every panel, so the pattern is the only variable — and the
 * catalogue serves them as `hairTypeExamples`. All four for a gender or none of
 * them, enforced server-side, because a photographed row above an icon row reads
 * as a broken screen. Until a set is published this falls back to the texture
 * diagrams at the bottom of this file, which are the standard
 * straight/wavy/curly/coily chart and say more about hair than a fourth copy of
 * one haircut did.
 *
 * ## Why it is a dialogue rather than two rows on the page
 *
 * Because once they are answered they are furniture. A pair of control rows
 * sitting permanently above the grid says "adjust me"; a dialogue that appears,
 * takes two taps and leaves says "we needed to know". The answers stay visible
 * afterwards as two chips that reopen this, so nothing is hidden — it is just no
 * longer occupying the top of the page after it has been dealt with.
 *
 * ## There is no dead end in it
 *
 * Gender decides which renders exist, so it has no "skip" — but hair type does,
 * because "all types" is a real answer rather than a refusal to give one, and it
 * is offered as one of the choices instead of as an escape hatch. Step one can
 * be backed out of only by dropping the photograph, which is honest: at that
 * point there is nothing left to narrow.
 */

import { useEffect, useMemo, useState } from 'react';

import type { Gender, HairTypeId } from '../../lib/contract/catalog';
import { HAIR_TYPE_IDS } from '../../lib/hairTypes';
import { useCatalog } from '../../lib/state/CatalogContext';
import { useSession } from '../../lib/state/SessionContext';
import { Skeleton } from '../ui';

export type SetupStep = 'gender' | 'hairType';

/**
 * The two answers, with the colour each one wears.
 *
 * Written out per gender rather than composed from a token name, because Tailwind
 * scans source text for class names — a string built at runtime is a class that
 * does not exist in the stylesheet.
 */
const GENDERS: {
  id: Gender;
  label: string;
  tile: string;
  panel: string;
  panelOn: string;
}[] = [
  {
    id: 'male',
    label: "Men's cuts",
    tile: 'bg-azure/14 ring-2 ring-azure',
    panel: 'bg-azure/8 text-azure',
    panelOn: 'bg-azure/16 text-azure',
  },
  {
    id: 'female',
    label: "Women's cuts",
    tile: 'bg-pink/14 ring-2 ring-pink',
    panel: 'bg-pink/8 text-pink',
    panelOn: 'bg-pink/16 text-pink',
  },
];

export function SetupDialog({
  step,
  onStep,
  onDone,
  onCancel,
}: {
  step: SetupStep;
  onStep: (step: SetupStep) => void;
  onDone: () => void;
  /** Backing out of the first question, which means dropping the photo. */
  onCancel: () => void;
}) {
  const { catalog, hairTypes } = useCatalog();
  const { gender, photo, setGender, setHairType } = useSession();

  /**
   * What has been chosen *in this run of the dialogue*, which is the only thing
   * that lights a tile.
   *
   * Deliberately not the session's stored answer — see the header. `gender` is
   * still read, but only to pick which set of hair-type examples to show, since
   * that has to follow the answer as soon as it is given.
   */
  const [pickedGender, setPickedGender] = useState<Gender | null>(null);
  const [pickedType, setPickedType] = useState<HairTypeId | null>(null);

  // A dialogue this tall must not leave the page scrolling behind it.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  /**
   * The published example for a texture, or null.
   *
   * Gender is matched exactly when it is known — a type 4 coil on a feminine
   * head is a different picture from the same coil on a masculine one, and it
   * was answered one question ago. When it is not, whichever exists, male first:
   * the convention `mannequinRender()` uses in the app.
   */
  const example = (type: HairTypeId): string | null => {
    const map = catalog?.hairTypeExamples;
    if (!map) return null;
    if (gender) return map[gender]?.[type] ?? null;
    return map.male?.[type] ?? map.female?.[type] ?? null;
  };

  /**
   * The four types, from the catalogue when it has arrived and by id when it has
   * not, so the dialogue keeps its shape for the frame before the fetch lands
   * rather than collapsing to nothing and jumping.
   */
  const orderedTypes = useMemo(
    () =>
      hairTypes.length
        ? hairTypes.slice().sort((a, b) => a.order - b.order)
        : HAIR_TYPE_IDS.map((id) => ({
            id,
            name: '',
            tier: '',
            description: '',
            icon: '',
            order: 0,
          })),
    [hairTypes],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step === 'gender' ? 'Whose catalogue?' : 'Your hair type'}
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas/85 px-4 py-8 backdrop-blur-2xl sm:px-6"
    >
      <div className="mx-auto w-full max-w-[660px]">
        <div className="brand-gradient animate-rise rounded-[30px] p-px shadow-[0_50px_120px_-40px_rgb(0_0_0/0.95)]">
          <div className="rounded-[29px] bg-canvas-raised p-6 sm:p-8">
            {/* ---------------------------------------------------------- */}
            {/* Where we are                                                */}
            {/* ---------------------------------------------------------- */}
            <div className="flex items-center gap-3.5">
              {/*
                The photograph, confirmed — and the way to change it.

                The upload box has no "here is your picture" state — choosing one
                opens this immediately — so this thumbnail is where the visitor
                actually sees what they are about to send. It is square rather
                than a round chip and large enough to check, because the one
                thing somebody wants to know here is whether they sent the right
                picture, and a 40px circle crops a face to the point where two
                photographs of one person look the same.

                The way to replace it sits *beside* it for the same reason. It
                was a line at the bottom of the card, a whole question away from
                the thing it acts on — and it was drawn only on the first
                question, so a visitor who noticed the wrong photograph once the
                textures were up had no way back to it at all. A control next to
                its subject is found by looking at the subject.
              */}
              {photo ? (
                <span className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[16px] bg-surface-alt ring-1 ring-inset ring-line sm:h-[76px] sm:w-[76px]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- an
                      object url for a blob this tab created. */}
                  <img
                    src={photo.objectUrl}
                    alt="The photo your preview will be generated from"
                    className="h-full w-full object-cover"
                  />
                </span>
              ) : null}
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Dot filled />
                  <Dot filled={step === 'hairType'} />
                </div>
                {photo ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="mt-2 text-[12.5px] text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Change photo
                  </button>
                ) : null}
              </div>
              <p className="ml-auto self-start text-[11px] font-extrabold uppercase tracking-[0.2em] text-faint">
                {step === 'gender' ? 'Question 1 of 2' : 'Question 2 of 2'}
              </p>
            </div>

            {step === 'gender' ? (
              <>
                <h2 className="mt-5 font-display text-[clamp(1.7rem,4.5vw,2.2rem)] leading-tight text-ink">
                  Whose catalogue should we search?
                </h2>
                <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
                  A cut&rsquo;s men&rsquo;s and women&rsquo;s readings are two different
                  haircuts, so this decides which ones you are shown.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                  {GENDERS.map((option) => {
                    const active = pickedGender === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setPickedGender(option.id);
                          setGender(option.id);
                          onStep('hairType');
                        }}
                        className={TILE + (active ? option.tile : TILE_OFF)}
                      >
                        <span
                          className={
                            'grid aspect-[5/4] w-full place-items-center rounded-[14px] ' +
                            'transition-colors duration-300 ' +
                            (active ? option.panelOn : option.panel)
                          }
                        >
                          <GenderIcon gender={option.id} />
                        </span>
                        <span className="mt-2.5 block px-1 pb-1 font-display text-[19px] leading-snug text-ink">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-5 font-display text-[clamp(1.7rem,4.5vw,2.2rem)] leading-tight text-ink">
                  What does your hair do?
                </h2>
                <p className="mt-2 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
                  A cut that is not offered for your texture is left out rather than shown
                  wrong, so this narrows the catalogue to what will actually work on you.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {orderedTypes.map((type) => {
                    const id = type.id as HairTypeId;
                    const photograph = example(id);
                    const active = pickedType === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        title={type.description || undefined}
                        onClick={() => {
                          setPickedType(id);
                          setHairType(id);
                          onDone();
                        }}
                        className={TILE + (active ? TILE_ON : TILE_OFF)}
                      >
                        {photograph ? (
                          <span className="block aspect-[4/5] w-full overflow-hidden rounded-[12px] bg-plate">
                            {/* eslint-disable-next-line @next/next/no-img-element --
                                a CDN object at the size it is drawn; the optimiser
                                would proxy the one thing this product sells. */}
                            <img
                              src={photograph}
                              alt=""
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          </span>
                        ) : (
                          <span
                            className={
                              'grid aspect-[4/5] w-full place-items-center rounded-[12px] ' +
                              'transition-colors duration-300 ' +
                              (active ? 'bg-violet/14 text-violet' : 'bg-white/5 text-ink-soft')
                            }
                          >
                            <TextureIcon type={id} />
                          </span>
                        )}

                        {type.name ? (
                          <>
                            <span className="mt-2 block truncate px-1 text-[13px] font-semibold text-ink">
                              {type.name}
                            </span>
                            <span className="mb-1 block truncate px-1 text-[11px] text-muted">
                              {type.tier}
                            </span>
                          </>
                        ) : (
                          <Skeleton className="my-2 ml-1 h-3 w-16" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/*
                  The fifth answer, drawn as one.

                  It was a grey pill in a footer row beside "Back" — the shape of
                  a secondary action, under four lit tiles, in the palette this
                  site uses for things that are *not* offered. So somebody who
                  genuinely does not know their own hair type read the screen as
                  four answers and an exit, and the four are the ones nobody in
                  that position can pick from. That is a dead end built out of
                  styling alone, which is the one thing the header of this file
                  says this dialogue must not have.

                  So it is a full-width answer directly under the grid, in the
                  violet the rest of the site uses for a real choice, with a
                  second line saying what it actually does. It is deliberately
                  *not* louder than the four tiles — it is the same weight,
                  which is the point: "all types" is one of the five answers to
                  this question, not a refusal to give one. `Back` drops to its
                  own line so nothing sits beside it competing to be the way out.
                */}
                <button
                  type="button"
                  onClick={() => {
                    // "All types" is an answer, not a skip — see the header.
                    setHairType(null);
                    onDone();
                  }}
                  className={
                    'mt-3 flex w-full items-center gap-3.5 rounded-[18px] bg-violet/12 p-3.5 text-left ' +
                    'ring-1 ring-inset ring-violet/40 transition-[background-color,box-shadow,transform] ' +
                    'duration-300 [transition-timing-function:var(--ease-out-quint)] ' +
                    'hover:-translate-y-0.5 hover:bg-violet/18 hover:ring-violet/60 ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet'
                  }
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-violet/16 text-violet">
                    <EverythingIcon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold text-ink">
                      Not sure? Show me everything
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                      Every cut in the catalogue. You can narrow it by texture at any point.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onStep('gender')}
                  className="mt-5 text-[12.5px] text-muted underline underline-offset-4 hover:text-ink"
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tiles
// ---------------------------------------------------------------------------

const TILE =
  'group overflow-hidden rounded-[18px] p-2 text-left ring-1 ring-inset ' +
  'transition-[background-color,box-shadow,transform] duration-300 ' +
  '[transition-timing-function:var(--ease-out-quint)] hover:-translate-y-1 ';
const TILE_ON = 'bg-violet/14 ring-2 ring-violet';
const TILE_OFF = 'bg-white/4 ring-line hover:bg-white/8 hover:ring-white/25';

function Dot({ filled }: { filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        'h-1.5 rounded-full transition-all duration-500 ' +
        (filled ? 'w-7 bg-violet' : 'w-3 bg-white/15')
      }
    />
  );
}

/**
 * Mars and Venus.
 *
 * The predecessor was a head and shoulders with the hair drawn differently on
 * each — which is a *picture of a person*, and at 60 pixels the difference
 * between short hair and long hair is a few pixels of stroke. These two shapes
 * carry no such load: they are the one symbol pair that is read rather than
 * interpreted, and they are the same drawing at any size.
 *
 * Both are one circle plus one appendage, so the two tiles are visually the same
 * weight — the circles are the same radius, the strokes the same width, and
 * neither glyph is larger than the other. That matters here more than usual,
 * because the pair has to read as two equal answers rather than as a default and
 * an alternative.
 */
function GenderIcon({ gender }: { gender: Gender }) {
  return (
    <svg viewBox="0 0 48 48" className="h-[52%] w-auto" aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {gender === 'male' ? (
          <>
            {/* The ring sits low-left; the arrow leaves it at 45°, from the
                point on the circle itself so the shaft never crosses it. */}
            <circle cx="19" cy="29" r="11" />
            <path d="M26.78 21.22 38 10" />
            <path d="M29.5 10H38v8.5" />
          </>
        ) : (
          <>
            <circle cx="24" cy="18" r="11" />
            <path d="M24 29v13" />
            <path d="M17.5 36h13" />
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * The texture chart, for when no example set has been published.
 *
 * Straight lines, S-waves, loops, a tight zigzag — the standard type 1 to type 4
 * diagram, which is what the question is actually about. It is a fallback and it
 * should lose to `hairTypeExamples` the moment a set exists: a photograph of the
 * texture on a head answers "is that mine", where a diagram only answers "which
 * of these four".
 */
const STRANDS: Record<HairTypeId, string> = {
  straight: 'M0 0v30',
  wavy: 'M0 0c-3 5 3 9 0 14s3 9 0 16',
  curly: 'M0 0c5 2 5 7 0 9s-5 7 0 9 5 7 0 9-5 6 0 8',
  coily: 'M0 0l-3.6 3.8 3.6 3.8-3.6 3.8 3.6 3.8-3.6 3.8 3.6 3.8-3.6 3.8 3.6 3.4',
};

/**
 * The mark on the fifth answer.
 *
 * The four texture icons are each one pattern repeated three times; this is all
 * four patterns at once, one strand each, so it reads as *the set of them*
 * rather than as a fifth texture. Same 48-box, same stroke, same family — a
 * different drawing here would make the answer look like a different kind of
 * thing from the four above it, which is exactly what it is not.
 */
function EverythingIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[58%] w-auto" aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={STRANDS.straight} transform="translate(9 9)" />
        <path d={STRANDS.wavy} transform="translate(19 9)" />
        <path d={STRANDS.curly} transform="translate(29 9)" />
        <path d={STRANDS.coily} transform="translate(40 9)" />
      </g>
    </svg>
  );
}

function TextureIcon({ type }: { type: HairTypeId }) {
  const strand = STRANDS[type];
  return (
    <svg viewBox="0 0 48 48" className="h-[56%] w-auto" aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={strand} transform="translate(14 9)" />
        <path d={strand} transform="translate(24 8)" />
        <path d={strand} transform="translate(34 9)" />
      </g>
    </svg>
  );
}
