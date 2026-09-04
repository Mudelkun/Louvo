import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  generateLook,
  generationSource,
  STAGE_INDEX,
  STAGE_RANGE,
  type GenerateRequest,
} from '@/api/client';
import {
  canSubmit,
  cancelPreview,
  collectPreview,
  fetchPreview,
  fetchPreviews,
  submitPreview,
  type PreviewJob,
  type PreviewStatus,
} from '@/api/previews';
import type { GeneratedLook, LookJob } from '@/api/types';
import { saveLookImage } from '@/lib/imageData';
import { onPreviewNotificationTapped, registerForPreviewPush } from '@/lib/push';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';

interface GenerationState {
  /** Jobs still working or failed. Finished jobs move into the library. */
  jobs: LookJob[];
  /** Convenience for badges. */
  processingCount: number;
  /** The most recently finished look, waiting to be acknowledged. */
  notification: GeneratedLook | null;
  start: (request: GenerateRequest) => string;
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  dismissNotification: () => void;
}

const GenerationContext = createContext<GenerationState | null>(null);

/**
 * Jobs the backend is running, kept across launches.
 *
 * Only those. A job on the direct or simulated path is a promise in memory and
 * genuinely dies with the process, so writing it down would mean restoring a
 * tile that can never finish. A server job is the opposite: the work carries on
 * without the app, and this record is how the app finds it again.
 */
const JOBS_KEY = 'hairify.jobs.v1';

/** How often a running job is asked about. Slower than the eased bar it feeds. */
const POLL_MS = 2000;
/** The bar's own tick — easing between reports, never inventing one. */
const CREEP_MS = 400;

/**
 * A failure, in the words a tile has room for.
 *
 * The model's own errors are long and quote the request back; what the user
 * needs is which of a few things went wrong, so the raw message is only used
 * when it is short enough to be a sentence.
 */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/previews_unconfigured/.test(message)) return 'Generation is not set up yet';
  if (/EXPO_PUBLIC_FAL_KEY/.test(message)) return 'Generation is not configured';
  if (/photo_too_large/.test(message)) return 'That photo is too large';
  if (/upload_failed|photo_missing/.test(message)) return 'Your photo did not upload';
  if (/40[13]|unauthor|forbidden/i.test(message)) return 'The generator rejected the key';
  if (/timed out|timeout/i.test(message)) return 'The generator took too long';
  if (/network|fetch failed|Failed to fetch|abort/i.test(message)) return 'No connection to the generator';
  return message.length > 0 && message.length <= 60 ? message : 'Something went wrong';
}

const newJobId = (): string => `job_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;

/**
 * The server states worth rebuilding a tile from.
 *
 * A job is adopted when the server knows about it and this app does not — after
 * a reinstall, a cleared cache, or a launch from a notification. Everything
 * outside this list is either over or waiting on something this app is not
 * doing, and a tile for one of those can only ever sit still.
 */
const ADOPTABLE: PreviewStatus[] = ['queued', 'running', 'ready', 'failed'];

/**
 * Background preview generation.
 *
 * Two quite different machines behind one surface, and which one runs is
 * `generationSource()`:
 *
 * - **`server`** — `start()` submits a job to the API and this provider becomes
 *   a *watcher*. The generation happens whether or not the app is running; the
 *   job list is persisted, reconciled on every foreground, and a push
 *   notification arrives if the user has left. Nothing here holds the work.
 * - **`direct` / `simulated`** — the original in-process paths, unchanged. The
 *   job is a promise, and leaving the app ends it.
 *
 * The surface is identical either way, which is what the old `TODO(backend)`
 * note promised and is why no screen changed.
 *
 * ## The result is collected, not just downloaded
 *
 * When a server job reports ready, the image is written into the app's documents
 * directory *first* and the server is told to delete its copy *second*. That
 * ordering is the whole privacy story: download first so nothing can be lost,
 * acknowledge second so nothing is kept. After it, the only copy of that preview
 * is on this phone, and it stays there until its owner deletes it.
 */
export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const { saveLook } = useLibrary();
  const { styleById } = useCatalog();
  const [jobs, setJobs] = useState<LookJob[]>([]);
  const [notification, setNotification] = useState<GeneratedLook | null>(null);

  /** Live cancel handles for in-process jobs — empty on the server path. */
  const running = useRef(new Map<string, () => void>());
  /** The request behind each in-process job, kept so a failed one can be retried. */
  const requests = useRef(new Map<string, GenerateRequest>());
  /** Remote ids currently being downloaded, so a poll cannot start a second one. */
  const collecting = useRef(new Set<string>());
  /**
   * Local job ids cancelled while their submit was still in the air.
   *
   * The one window `onCreated` cannot close: between `POST /v1/previews` leaving
   * the phone and its response arriving there is no id to cancel with, and the
   * row is being created in exactly that gap. So the intent is remembered and
   * acted on the moment the id turns up.
   */
  const abandoned = useRef(new Set<string>());
  /**
   * Remote ids cancelled from this session, which must never come back.
   *
   * The server stops listing a cancelled job, so this is only about the seconds
   * in between: a `reconcile()` that started before the DELETE landed sees the
   * job still running and would adopt it as an orphan a moment after the user
   * dismissed it. Cheap, bounded by how many things one person cancels, and it
   * closes a race that is otherwise invisible until somebody is annoyed by it.
   */
  const dismissed = useRef(new Set<string>());
  /** The latest jobs, readable from an interval without re-arming it every tick. */
  const latest = useRef<LookJob[]>([]);

  latest.current = jobs;

  // --- persistence --------------------------------------------------------

  const persist = useCallback((next: LookJob[]) => {
    // Server jobs only: see the note on JOBS_KEY.
    const durable = next.filter((job) => job.remoteId);
    AsyncStorage.setItem(JOBS_KEY, JSON.stringify(durable)).catch(() => undefined);
  }, []);

  const update = useCallback(
    (mutate: (previous: LookJob[]) => LookJob[]) => {
      setJobs((previous) => {
        const next = mutate(previous);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // --- finishing a server job ---------------------------------------------

  const finish = useCallback(
    async (job: LookJob, preview: PreviewJob) => {
      if (!preview.result || collecting.current.has(preview.id)) return;
      collecting.current.add(preview.id);

      try {
        // Onto the phone before anything else. Everything after this is
        // bookkeeping; this is the step that makes the preview the user's.
        const resultUri = await saveLookImage(preview.result.url, `${job.hairstyleId}-${preview.id}.png`);

        const look: GeneratedLook = {
          id: `look_${preview.id}`,
          hairstyleId: job.hairstyleId,
          hairstyleName: job.hairstyleName,
          gender: job.gender,
          hairType: job.hairType,
          sourcePhotoUri: job.sourcePhotoUri,
          resultUri,
          options: job.options,
          createdAt: Date.now(),
          simulated: false,
        };

        saveLook(look);
        setNotification(look);
        update((previous) => previous.filter((entry) => entry.id !== job.id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

        // Best effort, and deliberately last: the look is already saved, and an
        // uncollected result is deleted by the server's retention sweep anyway.
        // This call is how it goes early rather than how it goes at all.
        await collectPreview(preview.id).catch(() => undefined);
      } catch (error) {
        update((previous) =>
          previous.map((entry) =>
            entry.id === job.id
              ? { ...entry, status: 'failed', error: describeFailure(error) }
              : entry,
          ),
        );
      } finally {
        collecting.current.delete(preview.id);
      }
    },
    [saveLook, update],
  );

  /**
   * One report from the server, applied.
   *
   * The stage is the only thing that moves the bar properly; the creep below
   * eases within it. That division is the honesty rule the waiting screen is
   * built on — every moving thing is either the generator's own report or is
   * visibly not a claim about it.
   */
  const apply = useCallback(
    (job: LookJob, preview: PreviewJob) => {
      if (preview.status === 'ready') {
        void finish(job, preview);
        return;
      }

      if (preview.status === 'failed' || preview.status === 'cancelled') {
        update((previous) =>
          previous.map((entry) =>
            entry.id === job.id
              ? {
                  ...entry,
                  status: 'failed',
                  error: preview.error ? describeFailure(new Error(preview.error)) : 'Something went wrong',
                  queuePosition: undefined,
                }
              : entry,
          ),
        );
        return;
      }

      const floor = STAGE_RANGE[preview.stage][0];
      update((previous) =>
        previous.map((entry) =>
          entry.id === job.id
            ? {
                ...entry,
                stepIndex: STAGE_INDEX[preview.stage],
                progress: Math.max(entry.progress, floor),
                queuePosition: preview.queuePosition,
              }
            : entry,
        ),
      );
    },
    [finish, update],
  );

  // --- watching -----------------------------------------------------------

  /**
   * Asks about every server job that is still working.
   *
   * The detail endpoint per job rather than the list, because only it computes a
   * queue position — and one device holds one slot, so this is almost always a
   * single request.
   */
  const poll = useCallback(async () => {
    const watching = latest.current.filter((job) => job.remoteId && job.status === 'processing');
    for (const job of watching) {
      try {
        apply(job, await fetchPreview(job.remoteId as string));
      } catch {
        // A failed poll is not a failed generation. The work is on the server;
        // this is a phone on a bad connection, and the next tick asks again.
      }
    }
  }, [apply]);

  /**
   * Finds work this app has lost track of, and drops work that is gone.
   *
   * Runs on launch and on every return to the foreground — the two moments where
   * what the phone believes and what the server knows can have diverged, because
   * in between the app was not running and the queue was.
   */
  const reconcile = useCallback(async () => {
    if (generationSource() !== 'server') return;
    let previews: PreviewJob[];
    try {
      previews = await fetchPreviews();
    } catch {
      return;
    }

    const known = new Set(latest.current.map((job) => job.remoteId).filter(Boolean));
    const adopted: LookJob[] = previews
      .filter(
        (preview) =>
          !known.has(preview.id) &&
          !dismissed.current.has(preview.id) &&
          // Only states somebody can still act on. `awaiting_upload` is
          // deliberately not one of them: that job is waiting for a photograph
          // from a submit this app is no longer running, so nothing will ever
          // move it and adopting it means a tile stuck at the prepare floor
          // until the server's sweeper gets to it. `cancelled` and `collected`
          // never reach here — the server stops listing them — and this list is
          // the second lock on the same door.
          ADOPTABLE.includes(preview.status),
      )
      .map((preview) => ({
        id: newJobId(),
        remoteId: preview.id,
        hairstyleId: preview.hairstyleId,
        // A job with no local record has lost the things only the phone knew —
        // the name it was shown under and the photograph it was made from. It is
        // still adopted rather than abandoned: somebody paid for it, and the
        // result is worth more than the tile is tidy.
        hairstyleName: styleById(preview.hairstyleId)?.name ?? preview.hairstyleId,
        gender: preview.gender,
        hairType: preview.hairType,
        sourcePhotoUri: null,
        options: {},
        createdAt: preview.createdAt,
        status: preview.status === 'failed' ? 'failed' : 'processing',
        progress: STAGE_RANGE[preview.stage][0],
        stepIndex: STAGE_INDEX[preview.stage],
        ...(preview.error ? { error: describeFailure(new Error(preview.error)) } : {}),
      }));

    const live = new Set(previews.map((preview) => preview.id));
    // A remote job the server has never heard of is one that was collected on
    // another launch, or expired. Either way there is nothing left to wait for.
    const merged = [
      ...adopted,
      ...latest.current.filter(
        (job) => !job.remoteId || live.has(job.remoteId) || job.status === 'failed',
      ),
    ];
    update(() => merged);

    // Against `merged` rather than `latest.current`, which is a render-time ref
    // and does not yet contain what was adopted a line ago. Reading the stale one
    // meant an already-finished job waited for the next poll to be noticed —
    // self-correcting, and still the wrong list to ask.
    for (const preview of previews) {
      const job = merged.find((entry) => entry.remoteId === preview.id);
      if (job && preview.status === 'ready') void finish(job, preview);
    }
  }, [finish, styleById, update]);

  /** Restores the persisted jobs, then asks the server what is actually true. */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOBS_KEY);
        if (active && raw) {
          const stored = (JSON.parse(raw) as LookJob[]).filter((job) => job.remoteId);
          setJobs(stored);
          latest.current = stored;
        }
      } catch {
        // A corrupt job list is not worth blocking the app for — `reconcile`
        // rebuilds it from the server anyway.
      }
      if (active) await reconcile();
      // Refresh an existing registration only. The prompt itself is asked for
      // in context, on the first submit — a permission dialog on app start,
      // before the user has generated anything, is one most people decline once
      // and forever.
      if (active) void registerForPreviewPush(false);
    })();
    return () => {
      active = false;
    };
    // Once, on mount. `reconcile` is stable enough and re-running it on every
    // identity change would poll the list endpoint on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Poll while there is something to watch, and only while anyone is looking. */
  useEffect(() => {
    if (!jobs.some((job) => job.remoteId && job.status === 'processing')) return;

    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [jobs, poll]);

  /**
   * The bar between reports.
   *
   * Each stage creeps asymptotically toward its own ceiling, so the wait is
   * never still and never claims to be further along than the last thing the
   * server actually said. A bar that never quite fills beats one that sits at
   * 40% for forty seconds.
   */
  useEffect(() => {
    if (!jobs.some((job) => job.remoteId && job.status === 'processing')) return;

    const timer = setInterval(() => {
      update((previous) =>
        previous.map((job) => {
          if (!job.remoteId || job.status !== 'processing') return job;
          const ceiling = STAGE_RANGE[(['prepare', 'apply', 'finalize'] as const)[job.stepIndex] ?? 'apply'][1];
          return { ...job, progress: job.progress + (ceiling - job.progress) * 0.06 };
        }),
      );
    }, CREEP_MS);
    return () => clearInterval(timer);
  }, [jobs, update]);

  /**
   * An adopted job knows its hairstyle's id but not its name — the catalog may
   * still have been loading when it was rebuilt. This fills the name in as soon
   * as there is one, so a tile stops reading `messy-fringe` at the user.
   */
  useEffect(() => {
    if (!jobs.some((job) => job.hairstyleName === job.hairstyleId)) return;
    update((previous) =>
      previous.map((job) => {
        const name = job.hairstyleName === job.hairstyleId ? styleById(job.hairstyleId)?.name : null;
        return name ? { ...job, hairstyleName: name } : job;
      }),
    );
  }, [jobs, styleById, update]);

  /** Coming back to the app is the moment to find out what happened while away. */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });
    return () => subscription.remove();
  }, [reconcile]);

  /**
   * A tapped notification is a user asking to see the preview it was about.
   *
   * It only has to reconcile: the job is already known, `finish` downloads it,
   * and the look then arrives through `notification` exactly as it would have if
   * the app had been open the whole time. Nothing here navigates — the tap
   * brought them to the app, and the app already knows where a finished look
   * goes.
   */
  useEffect(() => onPreviewNotificationTapped(() => void reconcile()), [reconcile]);

  // --- starting -----------------------------------------------------------

  /**
   * Acts on a cancel that arrived before the job had a server id.
   *
   * Returns true when the caller should stop what it was doing: the tile is
   * already gone, the row has been cancelled, and there is nothing left to
   * attach an id to.
   */
  const settleAbandoned = useCallback((jobId: string, previewId: string): boolean => {
    if (!abandoned.current.has(jobId)) return false;
    abandoned.current.delete(jobId);
    dismissed.current.add(previewId);
    void cancelPreview(previewId).catch(() => undefined);
    return true;
  }, []);

  /** The in-process paths, unchanged: a promise, and it dies with the app. */
  const runLocally = useCallback(
    (jobId: string, request: GenerateRequest) => {
      const job = generateLook(request, ({ progress, stepIndex }) => {
        update((previous) =>
          previous.map((entry) => (entry.id === jobId ? { ...entry, progress, stepIndex } : entry)),
        );
      });
      running.current.set(jobId, job.cancel);

      job.promise
        .then((look) => {
          if (!running.current.has(jobId)) return; // cancelled
          running.current.delete(jobId);
          requests.current.delete(jobId);
          update((previous) => previous.filter((entry) => entry.id !== jobId));
          saveLook(look);
          setNotification(look);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        })
        .catch((error: unknown) => {
          if (!running.current.has(jobId)) return; // cancelled, not failed
          running.current.delete(jobId);
          const reason = describeFailure(error);
          update((previous) =>
            previous.map((entry) =>
              entry.id === jobId ? { ...entry, status: 'failed', error: reason } : entry,
            ),
          );
        });
    },
    [saveLook, update],
  );

  /**
   * Submits to the backend and records the handle.
   *
   * The tile exists before the network call returns, so the app never looks like
   * nothing happened while a photograph uploads. The idempotency key is derived
   * from the local job id, so a retried submit inside `submitPreview` cannot
   * become a second generation — or a second charge.
   */
  const runRemotely = useCallback(
    async (jobId: string, request: GenerateRequest) => {
      try {
        const preview = await submitPreview({
          hairstyleId: request.hairstyle.id,
          gender: request.gender,
          hairType: request.hairType,
          photoUri: request.photoUri as string,
          idempotencyKey: jobId,
          // Recorded before the photograph goes up, so the cross works during
          // the upload rather than only after it.
          onCreated: (previewId) =>
            update((previous) =>
              previous.map((entry) => (entry.id === jobId ? { ...entry, remoteId: previewId } : entry)),
            ),
        });

        if (settleAbandoned(jobId, preview.id)) return;

        update((previous) =>
          previous.map((entry) =>
            entry.id === jobId
              ? {
                  ...entry,
                  remoteId: preview.id,
                  stepIndex: STAGE_INDEX[preview.stage],
                  progress: Math.max(entry.progress, STAGE_RANGE[preview.stage][0]),
                  queuePosition: preview.queuePosition,
                }
              : entry,
          ),
        );

        // Asked for here and nowhere else: the user has just started something
        // that takes minutes and may outlast their attention, which is the one
        // moment a notification permission is obviously about them rather than
        // about us.
        void registerForPreviewPush(true);
      } catch (error) {
        abandoned.current.delete(jobId);
        update((previous) =>
          previous.map((entry) =>
            entry.id === jobId ? { ...entry, status: 'failed', error: describeFailure(error) } : entry,
          ),
        );
      }
    },
    [settleAbandoned, update],
  );

  const start = useCallback(
    (request: GenerateRequest) => {
      const jobId = newJobId();
      const remote = generationSource() === 'server' && canSubmit(request.photoUri);

      update((previous) => [
        {
          id: jobId,
          hairstyleId: request.hairstyle.id,
          hairstyleName: request.hairstyle.name,
          gender: request.gender,
          hairType: request.hairType,
          sourcePhotoUri: request.photoUri,
          options: request.options,
          createdAt: Date.now(),
          status: 'processing',
          progress: STAGE_RANGE.prepare[0],
          stepIndex: 0,
        },
        ...previous,
      ]);

      requests.current.set(jobId, request);
      if (remote) void runRemotely(jobId, request);
      else runLocally(jobId, request);
      return jobId;
    },
    [runLocally, runRemotely, update],
  );

  /**
   * Stops waiting, and stops the work.
   *
   * The tile goes immediately, because that is what pressing the cross is asking
   * for and making somebody watch a spinner in order to abandon something is
   * absurd. What matters is that the server hears about it in every case, and it
   * used to hear about it in only one: `remoteId` was written after the whole
   * three-call submit finished, so cancelling during the upload removed the tile
   * and left a real job running that nobody was watching. Two things close that —
   * `onCreated` records the id before the upload starts, and `abandoned` covers
   * the remaining gap while the first call is still in the air.
   *
   * Server-side the cancel is real: fal is asked to stop, the photograph is
   * deleted at once, and a result that arrives anyway is discarded rather than
   * stored. A generation already rendering may still be billed — that is fal's
   * behaviour, not a shortcut here.
   */
  const cancel = useCallback(
    (jobId: string) => {
      const job = latest.current.find((entry) => entry.id === jobId);
      running.current.get(jobId)?.();
      running.current.delete(jobId);
      requests.current.delete(jobId);

      if (job?.remoteId) {
        dismissed.current.add(job.remoteId);
        void cancelPreview(job.remoteId).catch(() => undefined);
      }
      // No id yet: the submit is in the air and is creating the row right now.
      // `settleAbandoned` cancels it the moment it answers.
      else abandoned.current.add(jobId);

      update((previous) => previous.filter((entry) => entry.id !== jobId));
    },
    [update],
  );

  /**
   * Another go, and on the server path that is a genuinely new generation.
   *
   * Rebuilt from the job record rather than from the original request, because
   * after a restart the request object is gone and the record is not — it
   * carries the style, the gender, the type and the photograph, which is all a
   * submit needs. A fresh id means a fresh idempotency key: this is meant to
   * cost another generation, which is why it is a button the user presses.
   */
  const retry = useCallback(
    (jobId: string) => {
      const job = latest.current.find((entry) => entry.id === jobId);
      if (!job) return;

      update((previous) =>
        previous.map((entry) =>
          entry.id === jobId
            ? {
                ...entry,
                status: 'processing',
                progress: STAGE_RANGE.prepare[0],
                stepIndex: 0,
                error: undefined,
                remoteId: undefined,
                queuePosition: undefined,
              }
            : entry,
        ),
      );

      const request = requests.current.get(jobId);
      if (generationSource() === 'server' && canSubmit(job.sourcePhotoUri)) {
        void (async () => {
          try {
            const preview = await submitPreview({
              hairstyleId: job.hairstyleId,
              gender: job.gender,
              hairType: job.hairType,
              photoUri: job.sourcePhotoUri as string,
              idempotencyKey: `${jobId}-${Date.now().toString(36)}`,
              onCreated: (previewId) =>
                update((previous) =>
                  previous.map((entry) => (entry.id === jobId ? { ...entry, remoteId: previewId } : entry)),
                ),
            });
            if (settleAbandoned(jobId, preview.id)) return;
            update((previous) =>
              previous.map((entry) => (entry.id === jobId ? { ...entry, remoteId: preview.id } : entry)),
            );
          } catch (error) {
            abandoned.current.delete(jobId);
            update((previous) =>
              previous.map((entry) =>
                entry.id === jobId ? { ...entry, status: 'failed', error: describeFailure(error) } : entry,
              ),
            );
          }
        })();
        return;
      }

      if (request) runLocally(jobId, request);
    },
    [runLocally, settleAbandoned, update],
  );

  const dismissNotification = useCallback(() => setNotification(null), []);

  useEffect(() => {
    const handles = running.current;
    return () => {
      // Only the in-process jobs. A server job is deliberately left running:
      // unmounting the provider means the app is closing, which is exactly the
      // case this whole backend exists to survive.
      handles.forEach((cancelJob) => cancelJob());
      handles.clear();
    };
  }, []);

  const value = useMemo<GenerationState>(
    () => ({
      jobs,
      processingCount: jobs.filter((job) => job.status === 'processing').length,
      notification,
      start,
      cancel,
      retry,
      dismissNotification,
    }),
    [jobs, notification, start, cancel, retry, dismissNotification],
  );

  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
}

export function useGeneration(): GenerationState {
  const context = useContext(GenerationContext);
  if (!context) throw new Error('useGeneration must be used inside <GenerationProvider>');
  return context;
}
