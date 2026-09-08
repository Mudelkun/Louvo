'use client';

/**
 * The catalogue itself, drifting past, on the front page.
 *
 * It exists because "we have a catalogue" is a claim and a row of actual cuts is
 * evidence — and because the single question a visitor has before they upload a
 * photograph of their face is *is my haircut in there*. Plates answer it faster
 * than any sentence.
 *
 * ## Why it moves, and why it is the whole shelf
 *
 * It was twelve stationary plates, six per gender, picked by popularity. Twelve
 * is not a catalogue; it is a sample of one, and the question above only gets
 * answered for the twelve people whose haircut happens to be among them.
 * Everybody else reads the same row as *my haircut is not in there* — the exact
 * opposite of what the section is for, and no sentence underneath undoes a
 * picture.
 *
 * So each shelf now carries **everything the catalogue has shot for that
 * gender** and travels, which is the only way a row a laptop wide shows forty
 * cuts. Two consequences are deliberate:
 *
 * - **The two rows run in opposite directions** — women left to right, men right
 *   to left. Not decoration: two rails moving the same way read as one long
 *   escalator and the eye picks a lane, where contra-motion reads as two
 *   shelves and keeps both legible as separate answers.
 * - **It stops under the pointer** (in `globals.css`, with the keyframes). Every
 *   plate is a link, and a link that moves out from under the cursor is a link
 *   nobody can follow. That is the rule the hero's sweep follows too: a
 *   demonstration yields the instant somebody reaches for it.
 *
 * ## It shows the catalogue, not the visitor
 *
 * Both shelves are drawn whatever gender the session holds, and every plate
 * cycles through **every texture that cut has actually been shot in**, captioned
 * with the types that render stands for — regardless of any hair type the
 * visitor has declared.
 *
 * That is a deliberate exception to the rule governing every *choosing* surface
 * on the site, where a declared type matches its variant exactly or falls
 * through to the drawing. The rule is about not putting a wrong image in front
 * of somebody who is picking; this strip is the hero's argument one section
 * down — one texture answers "will this work on my hair" for one person, and
 * somebody with a type 4 coil reads a rail of straight plates as a promise made
 * to a stranger. The caption is what keeps it honest: the plate says which types
 * it is, so nothing here claims to be a texture it is not. `<StyleChooser>` and
 * `/styles` still narrow strictly.
 *
 * The two shelves never draw the same *photograph* twice. Twenty-six styles are
 * offered to both genders, and every render shot before the `GENDER_CUT` fix is
 * byte-identical across them, so a unisex cut with one render appears on the
 * shelf that reaches it first and is illustrated on the other — the honest
 * state, and one that fills itself in as the women's renders are shot.
 */

import Link from 'next/link';
import { memo, useMemo, type ReactNode } from 'react';

import type { Gender, HairColor, HairType, HairTypeId, Hairstyle } from '../../lib/contract/catalog';
import { useCatalog } from '../../lib/state/CatalogContext';
import { useSession } from '../../lib/state/SessionContext';
import { typesForVariant, variantsOf } from '../../lib/hairTypes';
import { HERO_ANGLE, renderedVariants, type ResolvedRender } from '../../lib/renders';
import { useOnScreen } from '../../lib/useOnScreen';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useVariantCycle } from '../../lib/useVariantCycle';
import { Plate } from '../Plate';
import { Skeleton } from '../ui';

const LABELS: Record<Gender, string> = { male: 'Men', female: 'Women' };

/** Left to right for the women's shelf; the men's runs the keyframes backwards. */
const DIRECTION: Record<Gender, 'reverse' | 'normal'> = { female: 'reverse', male: 'normal' };

/**
 * How long one plate takes to cross its own width, which is what sets the speed:
 * the duration is this times the number of plates, so a shelf of forty and a
 * shelf of twenty drift at the same rate rather than the long one racing. Slow
 * enough to read a cut, fast enough that new ones arrive while somebody is
 * deciding whether to upload.
 */
const SECONDS_PER_PLATE = 2.6;

/**
 * Below this the shelf is repeated until it fills the rail.
 *
 * A track narrower than the viewport leaves a hole at the loop point, which
 * reads as the row having run out. It only bites on a catalogue that has barely
 * been published — the real shelves are twenty to forty cuts deep.
 */
const MIN_PLATES = 12;

/**
 * How far down the shelf illustrated plates are allowed.
 *
 * Renders sort first, so this is a floor rather than a cap: a shelf with plenty
 * of published imagery shows only that imagery, and one barely shot falls back
 * to the procedural drawings rather than to an empty rail. A marquee of line
 * drawings would be the wrong kind of evidence — the claim above the strip is
 * "every one shot the same way".
 */
const ILLUSTRATED_FLOOR = 12;

type Pick = { style: Hairstyle; renders: ResolvedRender[] };
type Row = { gender: Gender; picks: Pick[] };

export function CatalogueStrip() {
  const { catalog, hairstyles, hairTypes, defaultColor, loading } = useCatalog();
  const { gender } = useSession();

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return [];

    // Men on top and women beneath, unless the visitor has already said which
    // catalogue is theirs — a declared answer outranks a default ordering, the
    // same rule `<HairTypeChoice>` follows. It reorders the shelves rather than
    // dropping one, because this section is about what exists.
    const order: Gender[] = gender === 'female' ? ['female', 'male'] : ['male', 'female'];

    // Keyed on the render's own url, so one photograph is never on both shelves.
    // A cut with no render for this gender is not a collision: its drawing is
    // built per gender and is the honest stand-in until the render is shot.
    const taken = new Set<string>();

    return order.map((rowGender) => {
      const picks: Pick[] = hairstyles
        .filter((style) => style.genders.includes(rowGender))
        .map((style) => ({
          style,
          renders: renderedVariants(catalog.renders, {
            styleId: style.id,
            gender: rowGender,
            angle: HERO_ANGLE,
            variants: variantsOf(style),
          }),
        }))
        .filter((pick) => !pick.renders.some((entry) => taken.has(entry.ref.url)))
        // Renders first, then popularity. A catalogue whose imagery has not been
        // published yet still fills the rail with illustrations rather than with
        // placeholders that never resolve — a strip that never resolves reads as
        // a broken page rather than as a loading one.
        .sort(
          (a, b) => b.renders.length - a.renders.length || b.style.popularity - a.style.popularity,
        );

      const shot = picks.filter((pick) => pick.renders.length > 0);
      const shelf = shot.length >= ILLUSTRATED_FLOOR ? shot : picks.slice(0, ILLUSTRATED_FLOOR);

      for (const pick of shelf) {
        for (const entry of pick.renders) taken.add(entry.ref.url);
      }
      return { gender: rowGender, picks: shelf };
    });
  }, [catalog, hairstyles, gender]);

  const ready = !loading && rows.some((row) => row.picks.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {ready
        ? rows.map((row, index) => (
            <StripRow
              key={row.gender}
              row={row}
              hairTypes={hairTypes}
              color={defaultColor}
              eager={index === 0}
            />
          ))
        : (['male', 'female'] as Gender[]).map((rowGender) => (
            <StripSkeleton key={rowGender} gender={rowGender} />
          ))}
    </div>
  );
}

function StripRow({
  row,
  hairTypes,
  color,
  eager,
}: {
  row: Row;
  hairTypes: HairType[];
  color: HairColor | null;
  /** The shelf above the fold, whose first plates are worth fetching eagerly. */
  eager: boolean;
}) {
  const still = useReducedMotion();

  /**
   * The rail stops when it is scrolled away — see `useOnScreen` and the
   * `[data-offscreen]` rule in `globals.css`. Nothing about it is visible: it
   * pauses where it is and carries on from there.
   */
  const [rail, onScreen] = useOnScreen<HTMLDivElement>();

  /**
   * One copy of the shelf, long enough to fill the rail on its own.
   *
   * The track holds this twice and travels half its own width, which lands the
   * second copy exactly where the first started. No measurement, no resize
   * observer, and nothing to go wrong when an image or a font changes a width.
   */
  const shelf = useMemo(() => {
    if (row.picks.length === 0) return [];
    const filled = [...row.picks];
    while (filled.length < MIN_PLATES) filled.push(...row.picks);
    return filled;
  }, [row.picks]);

  /**
   * Still, and scrollable by hand, for anybody who has asked for less motion.
   *
   * Not merely the animation switched off: a paused marquee is a rail somebody
   * cannot reach the end of. It becomes what it was before it moved — one copy
   * of the shelf, scrolled with a finger or a trackpad.
   */
  if (still) {
    return (
      <Shelf gender={row.gender}>
        <div className="no-scrollbar -mx-5 flex overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8">
          {row.picks.map((pick, index) => (
            <StripPlate
              key={pick.style.id}
              pick={pick}
              gender={row.gender}
              hairTypes={hairTypes}
              color={color}
              priority={eager && index < 6}
            />
          ))}
        </div>
      </Shelf>
    );
  }

  return (
    <Shelf gender={row.gender}>
      <div
        ref={rail}
        data-offscreen={onScreen ? undefined : ''}
        className="marquee -mx-5 overflow-hidden px-5 sm:-mx-8 sm:px-8"
      >
        <div
          className="marquee-track"
          data-direction={DIRECTION[row.gender]}
          style={{ animationDuration: `${(shelf.length * SECONDS_PER_PLATE).toFixed(1)}s` }}
        >
          {/* Two copies. The second is furniture: it is the same shelf a few
              seconds later, so a screen reader and the tab order see it once. */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1 ? true : undefined}>
              {shelf.map((pick, index) => (
                <StripPlate
                  key={`${copy}-${index}-${pick.style.id}`}
                  pick={pick}
                  gender={row.gender}
                  hairTypes={hairTypes}
                  color={color}
                  priority={eager && copy === 0 && index < 6}
                  inert={copy === 1}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Shelf>
  );
}

function Shelf({ gender, children }: { gender: Gender; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {LABELS[gender]}
      </p>
      {children}
    </div>
  );
}

/**
 * One cut on the shelf, cycling through the textures it has been shot in.
 *
 * The cycle is the page's own shared beat (`useVariantCycle`) rather than a
 * timer of this plate's own: plates mount as they scroll into view, so equal
 * delays measured from each mount fan apart within a screenful, and a shelf that
 * changes together reads as the catalogue turning a page. Under reduced motion
 * the hook holds at the first render and nothing dissolves.
 */
const StripPlate = memo(function StripPlate({
  pick,
  gender,
  hairTypes,
  color,
  priority,
  inert,
}: {
  pick: Pick;
  gender: Gender;
  hairTypes: HairType[];
  color: HairColor | null;
  priority?: boolean;
  /** The duplicated copy: drawn, but never focusable. */
  inert?: boolean;
}) {
  const { style, renders } = pick;
  const index = useVariantCycle(renders.length);
  const current = renders[index] ?? null;

  /**
   * A hair type, in words. "Type 3" is a number, not an answer — it means
   * something only to somebody who has read the chart, and the one thing
   * everybody knows about their own hair is whether it is straight or curly.
   */
  const label = (type: HairTypeId | undefined) =>
    (type ? hairTypes.find((row) => row.id === type)?.name : null) ?? '';

  const shownTypes = current ? typesForVariant(style, current.variant) : [];

  return (
    <Link
      href={`/styles/${style.id}`}
      tabIndex={inert ? -1 : undefined}
      className="group me-3 w-[128px] shrink-0 sm:w-[144px]"
      title={style.name}
    >
      <div
        className={
          'relative aspect-[4/5] w-full overflow-hidden rounded-[14px] bg-plate ring-1 ring-inset ' +
          'ring-line transition-[transform,box-shadow] duration-500 ' +
          '[transition-timing-function:var(--ease-out-quint)] group-hover:-translate-y-1.5 ' +
          'group-hover:shadow-[0_20px_44px_-24px_rgb(0_0_0/0.9)]'
        }
      >
        {/* Stacked and cross-faded rather than swapped, so a change of texture is
            a dissolve and never a blank frame. */}
        {renders.length > 1 ? (
          renders.map((entry, position) => (
            <div
              key={entry.ref.url}
              className="absolute inset-0 transition-opacity duration-[900ms] ease-in-out"
              style={{ opacity: position === index ? 1 : 0 }}
            >
              <Plate
                render={entry}
                shape={style.shape}
                texture={style.shape.texture}
                color={color}
                gender={gender}
                angle={HERO_ANGLE}
                alt={`${style.name}, ${label(typesForVariant(style, entry.variant)[0])}`}
                priority={priority && position === 0}
                className="h-full w-full"
              />
            </div>
          ))
        ) : (
          <Plate
            render={current}
            shape={style.shape}
            texture={style.shape.texture}
            color={color}
            gender={gender}
            angle={HERO_ANGLE}
            alt={style.name}
            priority={priority}
            className="h-full w-full"
          />
        )}

        {/* Which texture is on the plate, said out loud — the half of the
            exception in this file's header that keeps it honest. */}
        {renders.length > 1 && shownTypes.length > 0 ? (
          <span
            className={
              'absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-bold ' +
              'uppercase tracking-[0.08em] text-on-plate backdrop-blur-sm'
            }
          >
            {shownTypes.map(label).join(' · ')}
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-[11.5px] text-muted transition-colors group-hover:text-ink">
        {style.name}
      </p>
    </Link>
  );
});

/** The rail's placeholder: the layout, and nothing about the data. */
function StripSkeleton({ gender }: { gender: Gender }) {
  return (
    <Shelf gender={gender}>
      <div className="-mx-5 flex overflow-hidden px-5 sm:-mx-8 sm:px-8">
        {Array.from({ length: MIN_PLATES }, (_, index) => (
          <Skeleton
            key={index}
            className="me-3 aspect-[4/5] w-[128px] shrink-0 rounded-[14px] sm:w-[144px]"
          />
        ))}
      </div>
    </Shelf>
  );
}

/** The count, for the line above the strip. Never guessed while loading. */
export function CatalogueCount() {
  const { hairstyles, loading } = useCatalog();
  if (loading) return <Skeleton as="span" className="inline-block h-4 w-10 align-middle" />;
  return <>{hairstyles.length}</>;
}
