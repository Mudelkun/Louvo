'use client';

/**
 * The home page, which is the product rather than a page about it.
 *
 * Louvo is a hairstyle try-on. The thing somebody came here to do is see a
 * haircut on their own face, and every sentence between them and that is a
 * sentence spent asking them to take our word for something they could have
 * checked in forty seconds. So the front door is the upload box, and the page
 * moves through exactly three states:
 *
 * 1. **A photograph.** One box, the promise about what happens to the picture,
 *    and a strip of real catalogue plates underneath so it is obvious in one
 *    glance what kind of thing this is.
 * 2. **Two questions**, in `<SetupDialog>` — whose catalogue, and what the hair
 *    does. They come *after* the photo here rather than before it as they do in
 *    the app, because a browser is entered sideways and the upload is the reason
 *    the visitor is on the page. They decide which renders exist, so they have
 *    to be answered before a grid can be honest.
 * 3. **The catalogue**, already narrowed to those answers, where a card is a
 *    link to that cut's own page. Generating happens *there*, not here — a
 *    haircut has a length, four angles and a texture, and a grid card shows one
 *    three-quarter render of it. See the header of `<StyleChooser>`.
 *
 *    It is narrowed, not *locked*: the grid carries the catalogue's own filter
 *    rail with both answers pre-set, so somebody who wants the women's shelf or
 *    the coily one moves a control rather than re-running a dialogue. That is
 *    also why the summary row no longer restates the two answers as chips —
 *    they would be a second place to change one thing.
 *
 * The state is *derived*, not stepped: there is no wizard index, and every
 * earlier answer stays reachable from the summary row.
 *
 * **The questions are asked on every upload**, not once per visitor. They are
 * about the person in the photograph rather than about the person at the
 * keyboard, so a stored answer is only good for the picture it was given about —
 * see `answeredFor` below. Nothing arrives pre-selected either: last visit's
 * answer is a fact about a different photograph, and a lit tile is the easiest
 * thing in the world to tap past without reading.
 *
 * ## What is carried over unchanged from the studio this replaces
 *
 * - **There is no paywall in the flow.** The credit gate is on the action and
 *   nowhere else, so a first visit is a complete preview from photograph to
 *   result without a price ever being named.
 * - **The client never adjusts a balance locally.** Submitting *holds* a credit
 *   server-side; the number here is refreshed from the server rather than
 *   decremented, because it moves without this tab being involved.
 * - **`ready: false` is not "no credits".** A paywall that flashes on a cold
 *   start lands on people who have twenty.
 * - **A cut that stops being offered is dropped visibly**, never generated
 *   anyway. Showing somebody a cut the catalogue says is not offered for their
 *   texture is the wrong-image failure the variant system exists to prevent.
 *   That check now lives on the style page, with the action it guards.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { parseHairType } from '../../lib/hairTypes';
import { useAccount } from '../../lib/state/AccountContext';
import { useSession } from '../../lib/state/SessionContext';
import { CatalogueCount, CatalogueStrip } from '../landing/CatalogueStrip';
import { HeroCompare, type HeroImages } from './HeroCompare';
import { HeroHeading } from './HeroHeading';
import { HeroPlates } from './HeroPlates';
import { PhotoChooser } from './PhotoChooser';
import { SetupDialog, type SetupStep } from './SetupDialog';
import { StyleChooser } from './StyleChooser';

/**
 * `hero` is resolved on the server, in `app/page.tsx`, by looking in
 * `public/hero/` — so a checkout without those files falls back to catalogue
 * plates instead of rendering broken images. It is a *list* of pairs rather
 * than one: the question the hero answers is "will this look like me", and one
 * face answers it for one person. See `public/hero/README.md`.
 */
export function TryOnFlow({ hero }: { hero: HeroImages[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const { photo, setGender, setHairType, setPhoto } = useSession();
  const { credits, ready } = useAccount();

  const [dialog, setDialog] = useState<SetupStep | null>(null);

  const chooser = useRef<HTMLDivElement>(null);

  /**
   * A cut carried in on the url, and where the flow hands off to it.
   *
   * `/?style=…` is what a style page mints when somebody wants to try a cut on
   * and has no photograph yet, so the honest end of that round trip is the page
   * they started from — with the photo taken, the two questions answered, and
   * the length they had already chosen still set. A ref rather than state
   * because it is consumed exactly once and must not survive into a second run
   * of the flow.
   */
  const carried = useRef<{ style: string; length: string | null } | null>(null);

  /**
   * The intent carried in from a style page, applied once.
   *
   * Read from the url rather than from context because it has to survive a full
   * page load — a link shared into a chat and opened cold is the same link as
   * one clicked inside the site.
   */
  useEffect(() => {
    const style = params.get('style');
    const length = params.get('length');
    if (style) {
      carried.current = {
        style,
        length: length === 'short' || length === 'long' ? length : null,
      };
    }

    const carriedGender = params.get('gender');
    if (carriedGender === 'male' || carriedGender === 'female') setGender(carriedGender);

    const carriedType = parseHairType(params.get('hairType'));
    if (carriedType !== undefined) setHairType(carriedType);

    // Deliberately once, on mount: re-running it would fight every control on
    // this page, since changing an answer does not change the url.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The photograph the two questions have been answered *for*.
   *
   * Not "have they ever been answered" — that was the first version, and it was
   * wrong. Gender and texture are properties of the person in the picture, not
   * of the visitor, so a stored answer is only good for the photograph it was
   * given about. Somebody trying a cut on a friend, or coming back a week later
   * for a different face, would otherwise be silently browsing the wrong
   * catalogue — with the answers a chip row away, which is exactly the place
   * nobody looks when nothing appears to be wrong.
   *
   * So every upload raises them again, with nothing pre-selected — see the
   * header of `SetupDialog`, which argues the second half: if the answers belong
   * to the photograph, showing last time's lit is this screen guessing about a
   * face it has not seen.
   */
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);

  const stage: 'photo' | 'setup' | 'cut' = !photo
    ? 'photo'
    : answeredFor !== photo.objectUrl
      ? 'setup'
      : 'cut';

  /**
   * The questions raise themselves the moment there is a photograph to narrow a
   * catalogue for, and close when there is not one — so dropping the photo from
   * inside the dialogue does not leave it up over an empty page.
   */
  useEffect(() => {
    if (stage === 'setup') setDialog((current) => current ?? 'gender');
    if (stage !== 'setup') setDialog(null);
  }, [stage]);

  return (
    <>
      {/* ================================================================ */}
      {/* 1. The photograph                                                 */}
      {/* ================================================================ */}
      {stage === 'photo' ? (
        <div className="aurora relative overflow-hidden">
          <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 pb-14 pt-10 sm:px-8 lg:px-12 lg:pb-20 lg:pt-16">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16">
              {/* The words and the one control, on the left. */}
              <div className="animate-rise">
                {/* Shared with the static fallback in `app/page.tsx`, which is
                    the only reason this page has a heading in its served html
                    at all — `<HeroHeading>` has the argument. */}
                <HeroHeading />

                <div className="mt-7">
                  <PhotoChooser />
                </div>
              </div>

              {/* The evidence, on the right. */}
              <div className="animate-rise [animation-delay:120ms]">
                {hero.length > 0 ? <HeroCompare images={hero} /> : <HeroPlates />}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* The catalogue as evidence, while there is nothing else on the page.
          Twelve plates answer "is my haircut in there" faster than a paragraph
          about the catalogue can. */}
      {stage === 'photo' ? (
        <div className="mx-auto w-full max-w-[1240px] px-5 pb-16 sm:px-8 lg:px-12">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13px] text-muted">
              <CatalogueCount /> cuts in the catalogue, every one shot the same way
            </p>
            <Link
              href="/styles"
              className="shrink-0 text-[13px] font-semibold text-violet-ink hover:underline"
            >
              Browse them all →
            </Link>
          </div>
          <div className="mt-5">
            <CatalogueStrip />
          </div>
        </div>
      ) : null}

      {/* ================================================================ */}
      {/* 2. The two questions                                              */}
      {/* ================================================================ */}
      {dialog ? (
        <SetupDialog
          step={dialog}
          onStep={setDialog}
          onDone={() => {
            setAnsweredFor(photo?.objectUrl ?? null);
            setDialog(null);

            // Somebody who arrived from a style page goes back to it — that is
            // the cut they asked for, and it is where the length control and the
            // generate button are.
            const intent = carried.current;
            if (intent) {
              carried.current = null;
              router.push(
                `/styles/${intent.style}${intent.length ? `?length=${intent.length}` : ''}`,
              );
              return;
            }

            // Otherwise the grid it just narrowed is what they should be looking
            // at, and on a phone it starts below the summary row.
            window.setTimeout(
              () => chooser.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              80,
            );
          }}
          onCancel={() => setPhoto(null)}
        />
      ) : null}

      {/* ================================================================ */}
      {/* 3. The catalogue                                                  */}
      {/* ================================================================ */}
      {stage === 'cut' ? (
        <div
          ref={chooser}
          className="mx-auto w-full max-w-[1240px] px-5 pb-24 pt-8 sm:px-8 lg:px-12"
        >
          {/* The answers so far, and every one of them still reachable. */}
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-surface/60 p-3 ring-1 ring-inset ring-line">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-surface-alt ring-1 ring-inset ring-line">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- an object
                // url for a blob this page created; nothing for a loader to do.
                <img src={photo.objectUrl} alt="Your photo" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="text-[12.5px] text-muted underline underline-offset-4 hover:text-ink"
            >
              Change photo
            </button>

            {/* The two answers are not restated here as chips. They used to be,
                each reopening the dialogue, and that was the only way to change
                them — the grid below now carries the catalogue's own rail with
                both of them pre-set, so a second control for the same state
                would be two places to change one thing. */}

            {ready ? (
              <p className="ml-auto pr-1 text-[12.5px] text-muted">
                <span className="tnum font-semibold text-ink-soft">{credits.total}</span>{' '}
                {credits.total === 1 ? 'preview' : 'previews'} left
              </p>
            ) : null}
          </div>

          <h2 className="mt-9 font-display text-[clamp(1.7rem,4vw,2.4rem)] leading-tight tracking-[-0.015em] text-ink">
            Now pick a cut.
          </h2>
          <p className="mt-2 max-w-[68ch] text-[12px] leading-relaxed text-muted">
            Narrowed to your answers, and the filters are yours to move. Every card is the studio
            render your preview comes from — open one for four angles, the length, and generate.
          </p>

          <div className="mt-6">
            <StyleChooser />
          </div>
        </div>
      ) : null}

    </>
  );
}
