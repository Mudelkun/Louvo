'use client';

/**
 * Everything this browser has made and kept.
 *
 * Two lists on one page, and they are deliberately different kinds of thing:
 *
 * - **Looks** are pictures of the visitor, in this browser's own storage, and
 *   the only copies in existence. They are read out of IndexedDB with no server
 *   call, because by this point there is nothing on the server to call for.
 * - **Favourites** are catalogue ids — a preference, not an image. They are the
 *   one thing here that would sensibly follow somebody onto another device once
 *   there are accounts.
 *
 * The empty state says which of the two is empty rather than showing one blank
 * page for both, because "you have not generated anything" and "you have not
 * saved any cuts" are different situations with different next steps.
 *
 * ## The preview still being made is in the list
 *
 * A generation in flight has no saved look behind it — the row is on the server
 * and the image does not exist yet — so this page used to show nothing for it at
 * all, and somebody who left the wait and came here saw the gallery they had
 * before they started. That reads as the preview having been lost, which is the
 * one thing the watcher design exists to prevent. So the job takes the first
 * cell, as itself: a **spinner** rather than a skeleton, because this is an
 * action in flight rather than content on its way — there is no shape to stand
 * in for a picture that does not exist yet. The caption is the server's own
 * report, its place in the queue or the ratcheted countdown, never an invented
 * percentage, and the tile is a link back into the wait.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { isTerminal } from '../lib/api';
import { getLook, listLooks, type LookSummary } from '../lib/looks';
import { useFavourites } from '../lib/useFavourites';
import { useCatalog } from '../lib/state/CatalogContext';
import { useGeneration, type TrackedJob } from '../lib/state/GenerationContext';
import { StyleCard } from './StyleCard';
import { ButtonLink, Notice, Overline, Rule, Skeleton, Spinner } from './ui';

/**
 * One tile, minting its thumbnail from the stored blob.
 *
 * The blob is fetched per tile rather than by loading every look at once,
 * because a gallery of thirty previews is thirty full-size JPEGs and holding
 * them all decoded is how a tab gets killed on a phone.
 */
function LookTile({ look }: { look: LookSummary }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let minted: string | null = null;
    void getLook(look.id).then((full) => {
      if (!live || !full) return;
      minted = URL.createObjectURL(full.result);
      setUrl(minted);
    });
    return () => {
      live = false;
      if (minted) URL.revokeObjectURL(minted);
    };
  }, [look.id]);

  return (
    <Link href={`/studio/result/${look.id}`} className="group block">
      <div
        className={
          'overflow-hidden rounded-[18px] bg-surface ring-1 ring-inset ring-line ' +
          'transition-[transform,box-shadow] duration-500 [transition-timing-function:var(--ease-out-quint)] ' +
          'group-hover:-translate-y-1 group-hover:shadow-[0_24px_56px_-28px_rgb(0_0_0/0.9)]'
        }
      >
        <div className="relative aspect-[4/5] w-full">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={look.hairstyleName} className="h-full w-full object-cover" />
          ) : (
            <Skeleton className="h-full w-full rounded-none" />
          )}
        </div>
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-ink-soft transition-colors group-hover:text-ink">
        {look.hairstyleName}
      </p>
      <p className="tnum text-[11.5px] text-faint">
        {new Date(look.createdAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        })}
      </p>
    </Link>
  );
}

/**
 * The preview being made right now, in the cell it will occupy when it lands.
 *
 * The photograph behind it is the one the job was started from, dimmed under the
 * spinner, so the tile is recognisably *this* generation rather than a generic
 * placeholder — and it degrades to a plain plate when there is none, which is
 * every job picked up by `reconcile()` in a tab that did not start it.
 *
 * The line under the spinner is the wait page's, subject to the same rule: a
 * queued job shows its real position, a running one shows the ratcheted
 * countdown, and neither is replaced by a guess when the server has said
 * nothing.
 */
function PendingTile({ job }: { job: TrackedJob }) {
  const line = useMemo(() => {
    if (job.status === 'awaiting_upload') return 'Sending your photo';
    if (job.status === 'queued') {
      return typeof job.queuePosition === 'number' && job.queuePosition > 0
        ? `${job.queuePosition} ahead in the queue`
        : 'Next in the queue';
    }
    // `ready` is the gap between the server having the image and this browser
    // having saved it. It is short, and it is not nothing: saying so is what
    // keeps the tile from looking stuck at the last second of the countdown.
    if (job.status === 'ready') return 'Saving to this browser';
    if (job.secondsLeft === null) return 'Working';
    if (job.secondsLeft <= 3) return 'Almost there';
    return `About ${job.secondsLeft}s left`;
  }, [job.status, job.queuePosition, job.secondsLeft]);

  return (
    <Link
      href="/studio/generating"
      className="group block"
      aria-label={`${job.hairstyleName}, generating`}
    >
      <div
        className={
          'overflow-hidden rounded-[18px] bg-surface ring-1 ring-inset ring-violet/35 ' +
          'transition-[transform,box-shadow] duration-500 [transition-timing-function:var(--ease-out-quint)] ' +
          'group-hover:-translate-y-1 group-hover:shadow-[0_24px_56px_-28px_rgb(0_0_0/0.9)]'
        }
      >
        <div className="relative aspect-[4/5] w-full">
          {job.sourceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.sourceUrl}
              alt=""
              className="h-full w-full object-cover opacity-40 [filter:saturate(0.55)]"
            />
          ) : null}
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/35 px-3 text-center"
          >
            <Spinner size={24} className="text-violet-ink" />
            <p className="text-[11.5px] font-medium leading-tight text-white/85">{line}</p>
          </div>
        </div>
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-ink-soft transition-colors group-hover:text-ink">
        {job.hairstyleName}
      </p>
      <p className="text-[11.5px] font-medium text-violet-ink">Generating</p>
    </Link>
  );
}

export function LooksGallery() {
  const { catalog, styleById, hairTypes, defaultColor, loading } = useCatalog();
  const { job, savedLookId } = useGeneration();
  const [looks, setLooks] = useState<LookSummary[] | null>(null);
  /**
   * Subscribed rather than read on mount: the hearts are on the cards in this
   * very grid now, so unsaving a cut has to take its card out with it.
   */
  const favourites = useFavourites();

  // Re-read on `savedLookId` as well as on mount: a job collected while this
  // page is open writes a look into IndexedDB behind us, and a list read only at
  // mount would hold the pending tile up over a preview that had already landed.
  useEffect(() => {
    void listLooks().then(setLooks);
  }, [savedLookId]);

  /**
   * The job worth a tile: one that has not settled badly and is not already in
   * the list below.
   *
   * `ready` is deliberately included — the image exists on the server but not
   * yet here — and the saved-id test is what hands the cell over rather than
   * briefly showing one preview twice.
   */
  const pending =
    job &&
    job.status !== 'failed' &&
    job.status !== 'cancelled' &&
    (!isTerminal(job) || job.status === 'ready') &&
    !(looks ?? []).some((look) => look.id === job.id)
      ? job
      : null;

  const savedStyles = (favourites ?? [])
    .map((id) => styleById(id))
    .filter((style): style is NonNullable<typeof style> => !!style);

  return (
    <>
      <section>
        <div className="flex items-end justify-between gap-6">
          <div>
            <Overline>Your previews</Overline>
            <h2 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight tracking-[-0.015em]">
              Looks you have made
            </h2>
          </div>
          <ButtonLink href="/" size="sm" variant="secondary">
            New preview
          </ButtonLink>
        </div>

        <div className="mt-8">
          {looks === null ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              {pending ? <PendingTile job={pending} /> : null}
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="aspect-[4/5] w-full rounded-[18px]" />
              ))}
            </div>
          ) : looks.length === 0 && !pending ? (
            <Notice
              title="Nothing here yet"
              body="Previews you generate are saved in this browser and nowhere else — which is what lets us delete our copy the moment one is finished."
              action={<ButtonLink href="/">Make your first</ButtonLink>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              {pending ? <PendingTile job={pending} /> : null}
              {looks.map((look) => (
                <LookTile key={look.id} look={look} />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="my-16">
        <Rule />
      </div>

      <section>
        <Overline>Your list</Overline>
        <h2 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight tracking-[-0.015em]">
          Cuts you saved
        </h2>

        <div className="mt-8">
          {favourites === null || loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* A card per saved id rather than a claim that there are none —
                  how many came back is not known while the catalogue is in
                  flight. */}
              {Array.from({ length: Math.max(favourites?.length ?? 0, 2) }, (_, index) => (
                <Skeleton key={index} className="aspect-[4/5] w-full rounded-[20px]" />
              ))}
            </div>
          ) : savedStyles.length === 0 ? (
            <Notice
              title="No saved cuts"
              body="Tap the heart on any hairstyle to keep it here while you decide."
              action={<ButtonLink href="/styles" variant="secondary">Browse the catalogue</ButtonLink>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
              {savedStyles.map((style) => (
                <StyleCard
                  key={style.id}
                  style={style}
                  hairTypes={hairTypes}
                  manifest={catalog!.renders}
                  gender={null}
                  hairType={null}
                  color={defaultColor}
                  saveable
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
