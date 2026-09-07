'use client';

/**
 * The waiting page.
 *
 * A *view* onto the job, never a gate. Both exits in the footer are real: one
 * leaves the job alone and the other stops it, and the page says which is which.
 * Leaving costs the view, not the work — the row is on the server and
 * `reconcile()` finds it on the next visit.
 *
 * It navigates itself to the result when the job resolves, which is the whole
 * reason to sit here rather than on a list. A failure stays put and says what
 * happened, with the credit refund stated plainly — a model that fails is not
 * the visitor's mistake and they should not have to wonder whether they paid
 * for it.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { GeneratingStage } from '../../../components/studio/GeneratingStage';
import { Button, ButtonLink, Notice, Section, Skeleton } from '../../../components/ui';
import { useAccount } from '../../../lib/state/AccountContext';
import { useGeneration } from '../../../lib/state/GenerationContext';

export default function GeneratingPage() {
  const router = useRouter();
  const { job, cancel, clear, savedLookId } = useGeneration();
  const { refresh } = useAccount();

  /**
   * The hand-off, and it waits for the *collection* rather than for `ready`.
   *
   * A job is `ready` the moment the server has the image; the result page needs
   * it saved on this machine. Navigating on `ready` would land on a gallery
   * entry that does not exist yet for the second or two the download takes.
   */
  useEffect(() => {
    if (savedLookId) {
      void refresh();
      router.replace(`/studio/result/${savedLookId}`);
    }
  }, [savedLookId, router, refresh]);

  // A settled job releases the credit either way, so the balance is re-read on
  // any terminal state rather than only on success.
  useEffect(() => {
    if (job && (job.status === 'failed' || job.status === 'cancelled')) void refresh();
  }, [job?.status, job, refresh]);

  if (!job) {
    return (
      <Section className="pb-24 pt-16">
        <div className="mx-auto max-w-[560px]">
          <Notice
            title="Nothing is generating"
            body="No preview is in flight in this browser. Start one in the studio, or open a look you have already made."
            action={
              <>
                <ButtonLink href="/">Try a haircut on</ButtonLink>
                <ButtonLink href="/looks" variant="secondary">
                  My looks
                </ButtonLink>
              </>
            }
          />
          <Skeleton className="mt-8 h-1 w-full opacity-0" />
        </div>
      </Section>
    );
  }

  if (job.status === 'failed') {
    return (
      <Section className="pb-24 pt-16">
        <div className="mx-auto max-w-[560px]">
          <Notice
            tone="error"
            title="That preview did not come back"
            body={`${job.error ?? 'The generator could not finish this one.'} Your credit has been returned — a model that fails is not your mistake.`}
            action={
              <>
                <ButtonLink href="/">Try again</ButtonLink>
                <Button variant="secondary" onClick={clear}>
                  Dismiss
                </Button>
              </>
            }
          />
        </div>
      </Section>
    );
  }

  if (job.status === 'cancelled') {
    return (
      <Section className="pb-24 pt-16">
        <div className="mx-auto max-w-[560px]">
          <Notice
            title="Stopped"
            body="The generation was cancelled, your photo was deleted, and the credit is back on your balance."
            action={<ButtonLink href="/">Start another</ButtonLink>}
          />
        </div>
      </Section>
    );
  }

  return (
    <Section className="pb-24 pt-12 sm:pt-16">
      <GeneratingStage job={job} />

      <div className="mx-auto mt-10 flex max-w-[560px] flex-wrap justify-center gap-3">
        <ButtonLink href="/styles" variant="secondary" size="sm">
          Keep browsing while it works
        </ButtonLink>
        <Button variant="ghost" size="sm" onClick={() => void cancel()}>
          Stop and delete my photo
        </Button>
      </div>
    </Section>
  );
}
