'use client';

/**
 * A generation in flight, watched from a browser tab.
 *
 * The web's counterpart to `GenerationProvider`, and it is a **watcher, not an
 * owner** — exactly as the app's is on the server path. The work is a row in
 * Postgres. This holds an id, polls it, and draws what comes back. Closing the
 * tab costs the view, not the job: the row is still there on the next visit and
 * `reconcile()` finds it.
 *
 * ## The honesty rule, which is the whole design
 *
 * Everything on the waiting screen is either the generator's own report or is
 * visibly not a claim about it. The server reports which of three *stages* a job
 * is in and nothing about how far through it is. So:
 *
 * - The percentage starts at the stage's floor and moves toward that stage's
 *   ceiling, never past it — only a real report can carry it into the next
 *   stage's range. Drawing it continuously is not invention; a bar that froze
 *   between two-second polls would read as a hang.
 * - **It is paced by the clock, not by the poll.** A stage spends its share of
 *   the bar over however long that stage usually takes, and then decelerates for
 *   ever without arriving (`stageFill`). What this replaced advanced a fixed
 *   fraction *per report*, so how fast the bar moved was a fact about the
 *   network rather than about the work: it reached the top of its range within a
 *   few seconds of a forty-five second generation and then sat there, which is
 *   the failure mode a progress bar exists to avoid.
 * - **The countdown only ever counts down.** It is fixed once, from the moment
 *   the job is first seen `running`, so nothing can push it out: a remaining
 *   time that grows while somebody watches it is worse than no estimate at all,
 *   and an overrun becomes "almost there" rather than a reset.
 * - While a job is *queued* the estimate is suppressed entirely in favour of its
 *   real position in the queue, and the bar holds. A guess there would be the one
 *   thing this screen is written never to make, and nothing has been done to the
 *   job yet to report.
 *
 * ## Collection
 *
 * A finished job is downloaded here and only then acknowledged, which is what
 * makes the server delete its copy. That ordering is the promise — download
 * first so nothing is lost, acknowledge second so nothing is kept — and it is
 * why `collect()` saves to IndexedDB before it calls `collectPreview`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  cancelPreview,
  collectPreview,
  fetchPreview,
  fetchPreviews,
  isTerminal,
  submitPreview,
  type PreviewJob,
  type PreviewStage,
} from '../api';
import { POLL_INTERVAL_MS, hasApi } from '../config';
import type { Gender, HairLengthId, HairTypeId, Hairstyle } from '../contract/catalog';
import { hasDevice } from '../device';
import { saveLook } from '../looks';
import { newIdempotencyKey, type PreparedPhoto } from '../photo';

/** Mirrors `GENERATION_STEPS` in `src/api/client.ts`. */
export const GENERATION_STEPS = [
  { id: 'prepare', label: 'Preparing your photo' },
  { id: 'apply', label: 'Applying the hairstyle' },
  { id: 'finalize', label: 'Finishing the result' },
] as const;

/**
 * Where a stage starts, and how far it may creep before the next one begins.
 *
 * The app's `STAGE_RANGE`, unchanged. The gaps between the ranges are
 * deliberate: a stage change is a visible jump, which is the one moment the bar
 * is reporting something real.
 */
export const STAGE_RANGE: Record<PreviewStage, [number, number]> = {
  prepare: [0.02, 0.16],
  apply: [0.2, 0.9],
  finalize: [0.92, 0.99],
};

export const STAGE_INDEX: Record<PreviewStage, number> = { prepare: 0, apply: 1, finalize: 2 };

/** Roughly how long the model takes once it actually has the photograph. */
const NOMINAL_MS = 45_000;

/**
 * How long each stage usually takes, which is the rate its share of the bar is
 * spent at.
 *
 * `prepare` is the upload, `apply` is the model, and `finalize` is only ever
 * seen on a job the server has already called `ready` — the server derives the
 * stage from the status, so nothing sits in `finalize` for any length of time
 * and its number is nominal.
 */
const STAGE_NOMINAL_MS: Record<PreviewStage, number> = {
  prepare: 6_000,
  apply: NOMINAL_MS,
  finalize: 4_000,
};

/** How much of a stage's range is spent before the bar starts decelerating. */
const STEADY = 0.75;

/** How often the bar is redrawn. Well under the poll, and deliberately so. */
const REDRAW_MS = 250;

/**
 * How full a stage reads after `elapsed`, as a fraction of its own range.
 *
 * Steady for as long as the stage usually takes, then decelerating for ever
 * afterwards: it approaches the stage's ceiling and never arrives. Both halves
 * are load-bearing.
 *
 * The steady half is what makes a wait watchable. This was a geometric creep of
 * 35% of the remaining range *per report*, which spends four fifths of a stage
 * in its first three reports however long the stage actually lasts — so the bar
 * read 90% about five seconds into a forty-five second generation and then did
 * not move again. A bar that stops is read as a hang, and it takes the one
 * honest signal on the screen — the jump at a stage change — down with it.
 *
 * The decelerating half is what keeps it from lying. An overrun has to remain
 * visibly an overrun: the number keeps climbing, by less and less, and cannot
 * reach the next stage's floor because only the server can say that.
 */
function stageFill(elapsed: number, nominal: number): number {
  const ratio = Math.max(0, elapsed) / nominal;
  if (ratio <= 1) return ratio * STEADY;
  return STEADY + (1 - STEADY) * (1 - 1 / ratio);
}

export interface TrackedJob extends PreviewJob {
  /** 0..1, eased. Never a claim beyond the stage the server reported. */
  progress: number;
  /** Seconds left, ratcheted, or null while queued or terminal. */
  secondsLeft: number | null;
  /** The style's name, kept locally so a job tile can be drawn with no catalog. */
  hairstyleName: string;
  /** Object url of the photograph this job was started from, for the wipe. */
  sourceUrl: string | null;
}

export interface StartRequest {
  hairstyle: Hairstyle;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId?: HairLengthId | null;
  photo: PreparedPhoto;
}

export interface GenerationValue {
  job: TrackedJob | null;
  /** A refusal worth showing the user, cleared by the next start. */
  error: ApiError | null;
  starting: boolean;
  start: (request: StartRequest) => Promise<string | null>;
  cancel: () => Promise<void>;
  clear: () => void;
  /** The saved look id, once a finished job has been collected. */
  savedLookId: string | null;
}

const GenerationContext = createContext<GenerationValue | null>(null);

const STORAGE_KEY = 'luvo.job.v1';

interface Remembered {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<TrackedJob | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [savedLookId, setSavedLookId] = useState<string | null>(null);

  /**
   * The last value the bar was drawn at, the stage it is being drawn within, and
   * the moment the model started work.
   *
   * Refs rather than state because all of them are written by the redraw clock
   * and read by it on the next tick; putting them in state would make every tick
   * a render that schedules another tick.
   */
  const eased = useRef(0);
  const anchor = useRef<{ jobId: string; stage: PreviewStage; since: number; base: number } | null>(
    null,
  );
  const runningSince = useRef<number | null>(null);
  /** Which job the four refs above describe. */
  const owner = useRef<string | null>(null);
  const collecting = useRef<string | null>(null);
  const source = useRef<{ id: string; url: string } | null>(null);

  /**
   * The bar, in the only terms this client honestly has: which stage the server
   * reported, and how long it has been in it.
   *
   * Time, not reports. The value used to be advanced once per poll, which tied
   * how fast the bar moved to how fast the network answered rather than to how
   * long the work takes — see `stageFill`. Anchoring it to the clock means a
   * stage spends its share of the bar over the time that stage actually lasts,
   * whatever the poll is doing.
   *
   * It only ever moves forward, and never past the stage it is in. A job that
   * goes backwards — a retry, a reconciled older row — holds rather than
   * appearing to un-generate.
   */
  const advance = useCallback((next: PreviewJob): number => {
    const [floor, ceiling] = STAGE_RANGE[next.stage];

    /**
     * Everything derived here belongs to one job.
     *
     * A different id — a row picked up by `reconcile()`, a second generation —
     * starts its own bar rather than inheriting the last one's, which would open
     * at wherever that one got to. `start()` clears the same refs; this is what
     * covers the paths that do not go through it.
     */
    if (owner.current !== next.id) {
      owner.current = next.id;
      eased.current = 0;
      anchor.current = null;
      runningSince.current = null;
    }

    if (next.status === 'ready' || next.status === 'collected') {
      eased.current = 1;
      return 1;
    }

    /**
     * Only work in flight moves the bar.
     *
     * A job waiting for a slot has had nothing done to it yet, and a bar
     * creeping through the queue would be inventing the one thing this screen
     * refuses to invent. What sits beside it — the job's real position in the
     * queue — says more than a moving number could, and holding here is what
     * makes the jump into `apply` mean "it has started".
     */
    if (next.status !== 'running' && next.status !== 'awaiting_upload') {
      eased.current = Math.max(floor, eased.current);
      return eased.current;
    }

    const held = anchor.current;
    const current =
      held && held.jobId === next.id && held.stage === next.stage
        ? held
        : {
            jobId: next.id,
            stage: next.stage,
            since: Date.now(),
            // A new job starts at its stage's floor; a job that has only changed
            // stage carries on from where the last one left it, so the change
            // reads as a jump forward rather than as a restart.
            base: Math.max(floor, eased.current),
          };
    anchor.current = current;

    const { since, base } = current;
    const fill = stageFill(Date.now() - since, STAGE_NOMINAL_MS[next.stage]);
    eased.current = Math.max(eased.current, base + (ceiling - base) * fill);
    return eased.current;
  }, []);

  /**
   * Seconds left, counted from the moment the work actually started.
   *
   * Taken from the clock rather than from the bar. It used to be
   * `NOMINAL_MS * (1 - progress)`, which made the estimate a function of a number
   * that is itself only an easing — so a bar running early made the countdown run
   * early with it, and the two were wrong together. The queue is excluded on
   * purpose: `NOMINAL_MS` is how long the model takes, and a job's wait for a slot
   * is not part of it.
   *
   * The ratchet is now *structural* rather than enforced: one deadline is fixed
   * the first time the job is seen `running` and nothing afterwards can move it,
   * so it can only ever count down. That was always the property that mattered —
   * a remaining time which grows while somebody watches it is worse than no
   * estimate at all — and an overrun sits at zero, which the screen reads as
   * "Almost there". There is deliberately no `Math.min` guarding it: with a fixed
   * deadline there is nothing for one to guard against, and a guard that cannot
   * fire reads as though something might still move it.
   */
  const countdown = useCallback((next: PreviewJob): number | null => {
    if (next.status !== 'running') return null;
    if (runningSince.current === null) runningSince.current = Date.now();
    return Math.max(0, Math.round((runningSince.current + NOMINAL_MS - Date.now()) / 1000));
  }, []);

  const decorate = useCallback(
    (next: PreviewJob, hairstyleName: string): TrackedJob => ({
      ...next,
      progress: advance(next),
      secondsLeft: countdown(next),
      hairstyleName,
      sourceUrl: source.current?.id === next.id ? source.current.url : null,
    }),
    [advance, countdown],
  );

  // -------------------------------------------------------------------------
  // Collection
  // -------------------------------------------------------------------------

  /**
   * Downloads a finished preview, saves it, and then tells the server to delete
   * its copy.
   *
   * Guarded by a ref rather than by job state because the poll loop can see
   * `ready` twice before a render lands, and two collections would mean two
   * downloads of the same image and a second `POST /collected` against a row the
   * first one already emptied.
   */
  const collect = useCallback(async (finished: TrackedJob) => {
    if (!finished.result?.url || collecting.current === finished.id) return;
    collecting.current = finished.id;

    try {
      const response = await fetch(finished.result.url);
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const result = await response.blob();

      const sourceBlob =
        source.current?.id === finished.id
          ? await fetch(source.current.url)
              .then((res) => res.blob())
              .catch(() => null)
          : null;

      await saveLook({
        id: finished.id,
        hairstyleId: finished.hairstyleId,
        hairstyleName: finished.hairstyleName,
        gender: finished.gender,
        hairType: finished.hairType,
        lengthId: finished.lengthId,
        createdAt: Date.now(),
        result,
        source: sourceBlob,
      });
      setSavedLookId(finished.id);

      // Only now. The image is on this machine; the server's copy can go.
      // Its failure is not the user's problem — the look is saved, and an
      // uncollected result is swept anyway — so it is swallowed on purpose.
      await collectPreview(finished.id).catch(() => {});
    } catch {
      // A failed download leaves the job `ready` and the result url live for
      // another few minutes. The result page retries by re-reading the job,
      // which is a better recovery than anything that could be done here.
      collecting.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Polling
  // -------------------------------------------------------------------------

  /**
   * The job the two clocks below read, so that neither has to name the job
   * *object* in its dependencies.
   *
   * That distinction was the whole bug behind a bar that reached 90% in the
   * first few seconds. Keying the poll on `job` meant every state change tore
   * the interval down, re-ran the effect and fired an immediate `tick()` — and
   * since a poll sets state, each poll scheduled the next one straight away. The
   * loop ran as fast as the network answered instead of every two seconds, and a
   * bar that advanced *per poll* spent its whole range before the model had
   * started. Both halves are fixed here: the loop is keyed on the id and on
   * whether there is anything to watch, and the bar is drawn from the clock.
   */
  const latest = useRef<TrackedJob | null>(null);
  useEffect(() => {
    latest.current = job;
  }, [job]);

  const jobId = job?.id ?? null;
  const watching = job !== null && !isTerminal(job);

  useEffect(() => {
    if (!jobId || !watching) return;

    let live = true;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const next = await fetchPreview(jobId, controller.signal);
        if (!live) return;
        const tracked = decorate(next, latest.current?.hairstyleName ?? next.hairstyleId);
        setJob(tracked);
        if (tracked.status === 'ready') void collect(tracked);
      } catch (caught) {
        // A dropped poll is not a failed generation. The row is still there and
        // the next tick will find it, so the tile keeps its last known state
        // rather than flashing an error at somebody mid-wait.
        if (caught instanceof ApiError && caught.status === 404 && live) {
          setJob((current) => (current ? { ...current, status: 'cancelled' } : null));
        }
      }
    };

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    void tick();
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [jobId, watching, decorate, collect]);

  /**
   * A second, much faster clock: the one the bar and the countdown are drawn on.
   *
   * The poll is every two seconds and neither a bar nor a countdown that moves
   * only that often reads as alive. This invents nothing — it redraws the same
   * two functions of the clock, both of which are bounded by the last stage the
   * server actually reported.
   *
   * It returns the job untouched when neither number has moved, so a queued job
   * holding its position costs no renders at all.
   */
  useEffect(() => {
    if (!jobId || !watching) return;
    const timer = setInterval(() => {
      setJob((current) => {
        if (!current || isTerminal(current)) return current;
        const progress = advance(current);
        const secondsLeft = countdown(current);
        if (progress === current.progress && secondsLeft === current.secondsLeft) return current;
        return { ...current, progress, secondsLeft };
      });
    }, REDRAW_MS);
    return () => clearInterval(timer);
  }, [jobId, watching, advance, countdown]);

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  /**
   * Finds work this browser started and stopped watching.
   *
   * The tab was closed, or the laptop slept, or the visitor navigated away —
   * none of which stopped the generation. `GET /v1/previews` returns everything
   * this device has in flight plus anything waiting to be collected, so a return
   * visit picks the job back up instead of losing it.
   */
  useEffect(() => {
    if (!hasApi || !hasDevice()) return;
    let live = true;

    let remembered: Remembered | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      remembered = raw ? (JSON.parse(raw) as Remembered) : null;
    } catch {
      remembered = null;
    }

    void fetchPreviews()
      .then((previews) => {
        if (!live) return;
        const open = previews.find((entry) => !isTerminal(entry) || entry.status === 'ready');
        if (!open) return;
        const name = remembered?.id === open.id ? remembered.hairstyleName : open.hairstyleId;
        const tracked = decorate(open, name);
        setJob(tracked);
        if (tracked.status === 'ready') void collect(tracked);
      })
      .catch(() => {
        // Offline on arrival is not something to report here: the catalog's own
        // error state already says the service is unreachable, and a second
        // notice about a job nobody has started yet is noise.
      });

    return () => {
      live = false;
    };
  }, [decorate, collect]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const start = useCallback(
    async (request: StartRequest): Promise<string | null> => {
      setError(null);
      setSavedLookId(null);
      setStarting(true);
      eased.current = 0;
      anchor.current = null;
      runningSince.current = null;
      owner.current = null;
      collecting.current = null;

      try {
        const submitted = await submitPreview({
          hairstyleId: request.hairstyle.id,
          gender: request.gender,
          hairType: request.hairType,
          lengthId: request.lengthId ?? null,
          photo: request.photo.blob,
          photoWidth: request.photo.width,
          photoHeight: request.photo.height,
          idempotencyKey: newIdempotencyKey(),
          onCreated: (id) => {
            // Recorded before the upload rather than after it, which is what
            // makes cancelling work during the slowest part of the flow.
            source.current = { id, url: request.photo.objectUrl };
            try {
              window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  id,
                  hairstyleId: request.hairstyle.id,
                  hairstyleName: request.hairstyle.name,
                } satisfies Remembered),
              );
            } catch {
              // A job that cannot be remembered is still a job that runs; it is
              // only harder to find again after a reload.
            }
          },
        });

        setJob(decorate(submitted, request.hairstyle.name));
        return submitted.id;
      } catch (caught) {
        setError(caught instanceof ApiError ? caught : ApiError.offline());
        return null;
      } finally {
        setStarting(false);
      }
    },
    [decorate],
  );

  const cancel = useCallback(async () => {
    if (!job) return;
    // Optimistic, because cancelling is the one action where the user's intent
    // is the whole answer: they asked to stop waiting. The server call still
    // happens, and it is what stops the generation and deletes the photograph.
    setJob((current) => (current ? { ...current, status: 'cancelled' } : null));
    await cancelPreview(job.id).catch(() => {});
  }, [job]);

  const clear = useCallback(() => {
    setJob(null);
    setError(null);
    setSavedLookId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing depends on this succeeding.
    }
  }, []);

  const value = useMemo<GenerationValue>(
    () => ({ job, error, starting, start, cancel, clear, savedLookId }),
    [job, error, starting, start, cancel, clear, savedLookId],
  );

  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
}

export function useGeneration(): GenerationValue {
  const value = useContext(GenerationContext);
  if (!value) throw new Error('useGeneration must be used inside <GenerationProvider>');
  return value;
}
