'use client';

/**
 * One saved look, read back out of this machine's own storage.
 *
 * There is no server call on this page and there cannot be: by the time a look
 * exists, our copy of the preview has been deleted. The image here came off the
 * bucket once, was written to IndexedDB, and was acknowledged — after which the
 * only copy in existence is this one. That is the promise, and this page is what
 * it feels like from the inside: your picture, on your machine, downloadable and
 * deletable by you and by nobody else — which is also why deleting asks first
 * (`<ConfirmDelete>`): there is no second copy anywhere to restore it from.
 *
 * The object urls are minted from the stored blobs on mount and revoked on
 * unmount, because a blob url pins its blob in memory for as long as it lives.
 *
 * ## The preview is shown; the comparison is offered
 *
 * The page opened on the wipe, at half, which meant the first thing anybody saw
 * of the thing they had just paid a credit for was half of it — with their own
 * unchanged photograph filling the other half and a handle down the middle of
 * their face. The comparison is the *second* question. The first is "what do I
 * look like", and it is answered by the finished picture, whole. So the frame
 * shows the preview and a `Compare` button puts the photograph back underneath
 * it.
 *
 * It is the same `<BeforeAfter>` either way, handed `before={null}` when it is
 * not comparing — the component's own no-slider branch. Swapping between two
 * different frames would move the picture by whatever the two disagreed about.
 *
 * ## Everything on one screen, on a large one
 *
 * Two columns from `lg`: the preview on the left, and what to try next on the
 * right, beside it rather than a scroll below it. That is the whole argument for
 * the layout — somebody looking at a haircut on their own face is the most
 * likely they will ever be to want a second one, and a suggestion under the fold
 * is a suggestion most people never see. The narrow layout keeps the old order,
 * because there is no "beside" on a phone.
 *
 * ## The look's answers become the session's
 *
 * A look records the gender and hair type answered *about the photograph in the
 * picture*. Everything that browses the catalogue reads the session instead, so
 * without adopting them the four cards here would be drawn from the look and the
 * page any of them opens would be drawn from a session that may have moved on to
 * a different face — one texture on the card, another on the page. Adopting is
 * also what makes the links out of here land on a catalogue already narrowed to
 * the answers this preview was generated with.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ANCHOR_LENGTH } from '../lib/renders';
import { ALL_HAIR_TYPES, relatedTo } from '../lib/hairTypes';
import { deleteLook, getLook, type SavedLook } from '../lib/looks';
import { useCatalog } from '../lib/state/CatalogContext';
import { useAdoptedAnswers, useSession } from '../lib/state/SessionContext';
import { BeforeAfter } from './BeforeAfter';
import { ShareButton } from './ShareButton';
import { StyleCardSkeleton } from './StyleCard';
import { SUGGESTION_COUNT, SuggestionShelf } from './SuggestionShelf';
import { Button, ButtonLink, Notice, Overline, Skeleton } from './ui';

/**
 * The two columns, in one place so the skeleton and the page cannot disagree
 * about the shape they are drawing.
 */
const LAYOUT =
  'flex flex-col gap-6 ' +
  'lg:grid lg:items-start lg:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]';

export function LookView({ id }: { id: string }) {
  const {
    catalog,
    hairstyles,
    hairTypes,
    defaultColor,
    loading: catalogLoading,
    styleById,
  } = useCatalog();
  const { photo } = useSession();
  const [look, setLook] = useState<SavedLook | null | 'missing'>(null);
  const [urls, setUrls] = useState<{ after: string; before: string | null } | null>(null);

  /** Off until asked for — see the header. */
  const [comparing, setComparing] = useState(false);

  /** Whether the delete confirmation is up, and whether it has been acted on. */
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const found = look && look !== 'missing' ? look : null;

  // The answers this preview was generated with, adopted once so every
  // catalogue surface downstream of this page agrees with what is on it.
  useAdoptedAnswers({
    gender: found?.gender,
    hairType: found ? (found.hairType ?? ALL_HAIR_TYPES) : undefined,
  });

  /**
   * What to try next, taken from the look rather than from the session.
   *
   * The look records the gender and hair type that were answered *about this
   * photograph*, which is the same reason `TryOnFlow` raises those questions per
   * upload rather than once per visitor: a session that has since moved on to a
   * different face would narrow this row to the wrong catalogue. Seeded from the
   * cut that was just generated, so the row is a next step rather than a second
   * grid.
   */
  const related = useMemo(
    () => (found ? relatedTo(hairstyles, found.hairstyleId, found.gender, found.hairType, SUGGESTION_COUNT) : []),
    [hairstyles, found],
  );

  /**
   * The two answers this preview was made with, as a query string.
   *
   * Carried into every catalogue page this one links to, so a catalogue opened
   * from a finished preview opens already narrowed to the preview rather than to
   * whatever was last browsed. `hairType` is always written, since "all types"
   * is an answer and its absence is not.
   *
   * **The length is deliberately not in here.** Gender and texture are facts
   * about the person in the photograph and travel to any cut; a length is a fact
   * about *one* haircut, and most of the catalogue is not offered at more than
   * one. Sending `length=short` to a suggestion that only exists at its anchor
   * would open that page holding a length its own control does not offer. It is
   * added to the link to the generated cut alone, below, where it is true.
   */
  const query = useMemo(() => {
    if (!found) return '';
    const params = new URLSearchParams();
    params.set('gender', found.gender);
    params.set('hairType', found.hairType ?? ALL_HAIR_TYPES);
    return params.toString();
  }, [found]);

  useEffect(() => {
    let live = true;
    let minted: string[] = [];

    void getLook(id).then((found) => {
      if (!live) return;
      if (!found) {
        setLook('missing');
        return;
      }
      const after = URL.createObjectURL(found.result);
      const before = found.source ? URL.createObjectURL(found.source) : null;
      minted = before ? [after, before] : [after];
      setLook(found);
      setUrls({ after, before });
    });

    return () => {
      live = false;
      for (const url of minted) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (look === null) {
    return (
      <div className={`mx-auto w-full max-w-[1180px] ${LAYOUT}`}>
        <div>
          <Skeleton className="aspect-[4/5] w-full rounded-[24px]" />
          <Skeleton className="mx-auto mt-6 h-9 w-52 rounded-full" />
        </div>
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-10 w-3/4" />
          <Skeleton className="mt-6 h-24 w-full rounded-[20px]" />
          <div className="mt-10 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <StyleCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (look === 'missing') {
    return (
      <Notice
        title="That look is not on this device"
        body="Saved looks live in this browser and nowhere else — that is what lets us delete our copy the moment a preview is done. Opening the link on another machine will not find it."
        action={
          <>
            <ButtonLink href="/">Generate another</ButtonLink>
            <ButtonLink href="/looks" variant="secondary">
              My looks
            </ButtonLink>
          </>
        }
      />
    );
  }

  const style = styleById(look.hairstyleId);

  /** The generated cut, at the length it was generated at — see `query`. */
  const cutHref =
    `/styles/${look.hairstyleId}?${query}` +
    (look.lengthId && look.lengthId !== ANCHOR_LENGTH ? `&length=${look.lengthId}` : '');

  const download = () => {
    if (!urls) return;
    const anchor = document.createElement('a');
    anchor.href = urls.after;
    anchor.download = `luvo-${look.hairstyleId}-${look.id.slice(-6)}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const remove = async () => {
    setRemoving(true);
    await deleteLook(look.id);
    window.location.href = '/looks';
  };

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <div className={LAYOUT}>
        {/* ------------------------------------------------------------- */}
        {/* The preview                                                    */}
        {/* ------------------------------------------------------------- */}
        {/* Sticky on a wide screen: the right-hand column is the taller of
            the two once four cards are in it, and the picture is what the
            suggestions are being weighed against. */}
        {/*
          `contents` on a phone, a real column from `lg`.

          The two columns hold the page's pieces in the order a wide screen
          wants them — picture on the left, everything about the cut on the
          right. A phone has no "beside", so the same pieces have to interleave:
          the name above the picture, the actions under it, and the four cuts to
          try next directly beneath those. Dissolving both wrappers into their
          parent is what lets `order-*` do that without a second copy of any of
          it — one DOM, two arrangements, and no chance of the two drifting.

          The orders themselves: name, picture, compare, actions, suggestions,
          the privacy line, this cut, and the way to start again.
        */}
        <div className="contents lg:block lg:sticky lg:top-[92px]">
          {urls ? (
            <div className="order-2">
              <BeforeAfter
                // Null unless asked for, which is `<BeforeAfter>`'s own
                // no-slider branch — the same frame, without the wipe.
                before={comparing ? urls.before : null}
                after={urls.after}
                alt={`You with a ${look.hairstyleName}`}
              />
            </div>
          ) : null}

          {urls?.before ? (
            <div className="order-3 text-center lg:mt-4">
              <button
                type="button"
                aria-pressed={comparing}
                onClick={() => setComparing((current) => !current)}
                className={
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold ' +
                  'ring-1 ring-inset transition-colors duration-200 focus-visible:outline-none ' +
                  'focus-visible:ring-2 focus-visible:ring-violet ' +
                  (comparing
                    ? 'bg-ink text-canvas ring-transparent'
                    : 'bg-white/5 text-ink-soft ring-line-strong hover:text-ink')
                }
              >
                <span aria-hidden>⟺</span>
                {comparing ? 'Hide the comparison' : 'Compare with your photo'}
              </button>
              {comparing ? (
                <p className="mt-2.5 text-[12.5px] text-muted">
                  Drag the handle to wipe between your photo and the preview.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Download, share, delete — in falling order of what somebody came
              here to do, and drawn in falling weight to match. Delete is a
              ghost rather than a fourth solid button beside two benign ones:
              it destroys the only copy of the picture that exists, so it
              belongs in reach without being the same size as the action next
              to it. The confirmation is what actually guards it. */}
          <div className="order-4 flex flex-wrap items-center justify-center gap-3 lg:mt-6">
            <Button size="lg" onClick={download}>
              <DownloadIcon />
              Download
            </Button>
            <ShareButton
              hairstyleId={look.hairstyleId}
              hairstyleName={look.hairstyleName}
              gender={look.gender}
              hairType={look.hairType}
              lengthId={look.lengthId}
            />
            <Button variant="ghost" size="lg" onClick={() => setConfirming(true)}>
              <TrashIcon />
              Delete
            </Button>
          </div>

          <p className="order-6 mx-auto max-w-[46ch] text-center text-[12px] leading-relaxed text-faint lg:mt-5">
            This picture is stored in this browser only. Sharing sends a link to the{' '}
            <em>hairstyle</em> — the catalogue&rsquo;s own studio render — never your photo.
          </p>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* The cut, and the next one                                      */}
        {/* ------------------------------------------------------------- */}
        <div className="contents lg:block">
          <header className="order-1">
            <Overline>Your preview</Overline>
            <h1 className="mt-3 font-display text-[clamp(2rem,4.2vw,2.7rem)] leading-[1.03] tracking-[-0.02em]">
              {look.hairstyleName}
            </h1>
          </header>

          {/* "About this cut" stays above the suggestions, for the reason it
              always did: the heading names the cut in the picture, and four
              other haircuts above it would leave it pointing at whichever one
              the eye landed on last. The link carries every answer this preview
              was generated with, so the catalogue opens narrowed to it. */}
          {style ? (
            <div className="order-7 rounded-[20px] bg-surface/60 p-5 ring-1 ring-inset ring-line lg:mt-6">
              <h2 className="font-display text-[19px] leading-snug text-ink">About this cut</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{style.description}</p>
              <Link
                href={cutHref}
                className="mt-4 inline-block text-[13px] font-semibold text-violet-ink"
              >
                See it in the catalogue &rarr;
              </Link>
            </div>
          ) : null}

          {/*
            The catalogue's own "and then?", drawn by the same `<SuggestionShelf>`
            the style page uses — one heading, one rail, drifting at every width,
            so the two places the site offers a next haircut are visibly one
            feature.
            This page owns the frame: where it sits in the column order, and the
            sentence under the heading, which only makes sense here.
          */}
          {related.length || catalogLoading ? (
            <SuggestionShelf
              className="order-5 lg:mt-10"
              title="Try one of these next"
              /* Honest about what the next one actually costs the visitor. The
                 photograph lives in memory for the length of the tab, so a
                 reload is the difference between one tap and uploading again —
                 and promising the first while holding neither is the kind of
                 small lie the rest of this site spends paragraphs avoiding. */
              note={
                photo
                  ? 'Your photo is still here — pick one and it goes straight on.'
                  : 'Add your photo again and any of these takes about forty seconds.'
              }
              styles={related}
              hairTypes={hairTypes}
              manifest={catalog?.renders ?? null}
              gender={look.gender}
              hairType={look.hairType}
              color={defaultColor}
              query={query}
              loading={catalogLoading}
            />
          ) : null}

          <div className="order-8 lg:mt-6">
            <ButtonLink href="/" variant="secondary">
              Use a different photo
            </ButtonLink>
          </div>
        </div>
      </div>

      {confirming ? (
        <ConfirmDelete
          hairstyleName={look.hairstyleName}
          removing={removing}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </div>
  );
}

/**
 * The tray-and-arrow pair.
 *
 * Deliberately the mirror of the one `<ShareButton>` draws — same tray, same
 * shaft, the arrowhead turned over — because the two sit next to each other and
 * two icons from different families next to each other read as two unrelated
 * things rather than as a pair of ways to keep the picture.
 */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path
        d="M12 3v12M12 15l-4-4M12 15l4-4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path
        d="M4 7h16M10 4h4M9.5 7l.6 12M14.5 7l-.6 12M6.5 7l.8 12.1A1 1 0 0 0 8.3 20h7.4a1 1 0 0 0 1-.9L17.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The one confirmation on the site, on the one action that cannot be undone.
 *
 * Our copy of the preview was deleted the moment this one landed, so there is no
 * second copy anywhere to restore from — no server, no bin, no undo. That is
 * what the body says, in those terms, because "are you sure?" is a question
 * nobody reads and "this cannot be undone" is a sentence every app prints about
 * things that can be.
 *
 * Three details are the difference between a confirmation and a speed bump:
 *
 * - **The safe answer holds the focus.** `autoFocus` is on *Keep it*, so a
 *   return pressed out of momentum keeps the picture. It is also what puts a
 *   keyboard or a screen reader inside the dialogue rather than behind it.
 * - **Escape cancels**, which is the only keyboard exit a modal owes anybody and
 *   the only one on the site — the setup dialogue has no cancel to offer, this
 *   one does.
 * - **The backdrop is a cancel too**, and it is a button rather than a click
 *   handler on the overlay so it is not a control that only a pointer can reach.
 *
 * It follows the setup dialogue's shape — fixed overlay, body scroll locked, the
 * brand hairline — so the two read as the same kind of interruption.
 */
function ConfirmDelete({
  hairstyleName,
  removing,
  onCancel,
  onConfirm,
}: {
  hairstyleName: string;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-canvas/85 px-4 py-8 backdrop-blur-2xl"
    >
      {/* The backdrop, as something focusable rather than as a click handler on
          the overlay — a cancel only a pointer can reach is not a cancel. */}
      <button
        type="button"
        aria-label="Keep this look"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />

      <div className="brand-gradient animate-rise relative w-full max-w-[420px] rounded-[26px] p-px shadow-[0_50px_120px_-40px_rgb(0_0_0/0.95)]">
        <div className="rounded-[25px] bg-canvas-raised p-6 sm:p-7">
          <h2
            id="confirm-delete-title"
            className="font-display text-[22px] leading-snug text-ink"
          >
            Delete this preview?
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            This browser holds the only copy of your {hairstyleName} preview. Ours was deleted
            the moment it landed here, so there is nothing to restore it from — download it
            first if you want to keep it.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button autoFocus variant="secondary" onClick={onCancel} disabled={removing}>
              Keep it
            </Button>
            <Button variant="danger" loading={removing} onClick={onConfirm}>
              {removing ? 'Deleting…' : 'Delete for good'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
