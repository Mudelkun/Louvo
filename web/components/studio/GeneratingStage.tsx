'use client';

/**
 * The wait, with the payoff in front of the visitor.
 *
 * Pressing Generate used to be the end of the flow on the phone — the job was
 * queued and the user was dropped on a list where a thirty-second round trip was
 * a small tile reading "Processing…" over a bar that froze between polls. The
 * fix, there and here, is the same: put the thing being made on screen, at size,
 * and let the frame close around it as the work lands.
 *
 * ## Every moving thing is either a real report or visibly not a claim
 *
 * That is the whole rule, and it is worth stating before the code because
 * everything here is a consequence of it.
 *
 * - **The frame, the percentage and the clearing scrim are `job.progress`** —
 *   the server's own stage, paced by the clock across however long that stage
 *   usually takes and redrawn four times a second, so they are never still and
 *   never done early. Easing is not invention; it is the same number drawn
 *   continuously. `stageFill` in `GenerationContext` is where the pacing lives
 *   and why it is shaped the way it is.
 * - **The countdown ratchets.** Each report may only pull it earlier. The naive
 *   estimate climbs whenever progress holds still, and a remaining time that
 *   grows while somebody watches it is worse than no estimate at all — so an
 *   overrun becomes "almost there" rather than a reset.
 * - **While the job is queued there is no estimate at all**, only its real
 *   position in the queue. A guess there would be the one thing this screen is
 *   written never to make.
 * - **The scissors are the other kind.** Neither their travel nor their snip is
 *   tied to progress: their job is to separate "slow" from "hung", and scissors
 *   that slowed with the queue would read as the app struggling rather than as
 *   the queue being busy.
 * - **The word is gated on the job's real stage.** One pool per stage, so the
 *   word on screen is always a fair description of what the generator reported.
 *   *Which* word it is, is pacing. A single list cycled on a timer is a fake
 *   checklist with better manners — it says "Tapering" while the request is
 *   still queued.
 *
 * The words are a barber's rather than a machine's on purpose: "applying the
 * hairstyle" is what the software does, "tapering" is what the visitor asked
 * for.
 */

import { useEffect, useMemo, useState } from 'react';

import { STAGE_INDEX, type TrackedJob } from '../../lib/state/GenerationContext';

/** One pool per stage. Long enough to outlast it — a pool that runs out loops
 *  visibly, and a visible loop is what gives a timer away. */
const STAGE_WORDS: string[][] = [
  [
    'Analysing your photo',
    'Finding the hairline',
    'Reading the light',
    'Mapping the head',
    'Measuring the crown',
    'Checking the angle',
  ],
  [
    'Sectioning',
    'Combing out',
    'Snipping',
    'Shaping',
    'Clipping',
    'Tapering',
    'Blending',
    'Texturising',
    'Layering',
    'Cutting in',
    'Thinning out',
    'Sculpting',
    'Shaping the fringe',
    'Cleaning the neckline',
    'Detailing',
  ],
  ['Dusting off', 'Combing through', 'Styling', 'Checking the mirror', 'Finishing'],
];

const WORD_MS = 1600;

function WordTicker({ stepIndex }: { stepIndex: number }) {
  const pool = STAGE_WORDS[stepIndex] ?? STAGE_WORDS[0];
  const [index, setIndex] = useState(0);

  // Restarts at the top of the pool when the stage changes, so a stage change
  // is visible as the language changing rather than only as a bar moving.
  useEffect(() => {
    setIndex(0);
    const timer = setInterval(() => setIndex((value) => value + 1), WORD_MS);
    return () => clearInterval(timer);
  }, [stepIndex]);

  return (
    <span key={`${stepIndex}-${index}`} className="animate-fade inline-block">
      {pool[index % pool.length]}
    </span>
  );
}

/**
 * A pair of blades snipping its way across the photo.
 *
 * Two rotating halves about one pivot, riding the bright edge of the band that
 * sweeps down the frame. Drawn as transforms on two wrappers rather than as
 * animated SVG attributes — rotating a box about its own centre *is* rotating a
 * blade about its screw, and a transform does not cost a re-render per frame.
 *
 * It carries no travel of its own: it is a child of the band, so the two share
 * one animation and cannot drift apart. They used to run the same keyframes
 * separately, which is not the same thing at all — `translateY` is a percentage
 * of the *element*, so a 44px pair of scissors and a band 22% of the frame tall
 * moved at wildly different speeds down the same picture.
 */
function Scissors() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2"
    >
      <svg viewBox="0 0 44 44" className="h-11 w-11 drop-shadow-[0_0_12px_rgb(var(--violet-rgb)/0.8)]">
        <g stroke="white" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.95">
          <g style={{ transformOrigin: '22px 26px', animation: 'luvo-snip 1.3s ease-in-out infinite' }}>
            <path d="M22 26 L11 6" />
            <circle cx="9" cy="4" r="3.2" />
          </g>
          <g
            style={{
              transformOrigin: '22px 26px',
              animation: 'luvo-snip 1.3s ease-in-out infinite reverse',
            }}
          >
            <path d="M22 26 L33 6" />
            <circle cx="35" cy="4" r="3.2" />
          </g>
          <circle cx="22" cy="26" r="1.4" fill="white" />
        </g>
      </svg>
    </div>
  );
}

export function GeneratingStage({ job }: { job: TrackedJob }) {
  const stepIndex = STAGE_INDEX[job.stage];
  const percent = Math.round(job.progress * 100);

  const queued = job.status === 'queued' || job.status === 'awaiting_upload';

  const line = useMemo(() => {
    if (job.status === 'awaiting_upload') return 'Sending your photo';
    if (job.status === 'queued') {
      return typeof job.queuePosition === 'number' && job.queuePosition > 0
        ? `${job.queuePosition} ahead of you in the queue`
        : 'Next in the queue';
    }
    if (job.secondsLeft === null) return null;
    if (job.secondsLeft <= 3) return 'Almost there';
    return `About ${job.secondsLeft}s left`;
  }, [job.status, job.queuePosition, job.secondsLeft]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="relative">
        {/* The frame closes as the work lands: a gradient border whose visible
            arc is the progress the server actually reported. */}
        {/* No CSS transition here: a `background-image` is not interpolable, so
            one would be decoration that does nothing. The arc is smooth because
            the value behind it is redrawn every `REDRAW_MS`. */}
        <div
          className="rounded-[26px] p-[2px]"
          style={{
            background: `conic-gradient(from 180deg, var(--color-violet) 0deg, var(--color-pink) ${
              percent * 3.6
            }deg, rgb(255 255 255 / 0.07) ${percent * 3.6}deg)`,
          }}
        >
          <div className="relative overflow-hidden rounded-[24px] bg-surface">
            {job.sourceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={job.sourceUrl}
                alt=""
                aria-hidden
                className="block max-h-[58vh] w-full object-contain"
              />
            ) : (
              <div className="aspect-[4/5] w-full bg-surface-alt" />
            )}

            {/* The scrim clears as the work lands — the same number as the
                frame, drawn a second way. */}
            <div
              className="pointer-events-none absolute inset-0 bg-canvas transition-opacity duration-300"
              style={{ opacity: 0.55 * (1 - job.progress) }}
            />

            {/* The scan band and its scissors. Not a claim about progress — and
                one element on one animation, at a constant speed, fading through
                the wrap rather than snapping back to the top. The pacing and the
                travel are in `.luvo-scan`. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="luvo-scan absolute inset-x-0 top-0 h-[22%]">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to bottom, transparent, rgb(var(--violet-rgb)/0.35), rgb(var(--pink-rgb)/0.22), transparent)',
                  }}
                />
                <Scissors />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="font-display text-[clamp(1.6rem,4vw,2.2rem)] leading-tight text-ink">
          {queued ? 'Waiting for a slot' : <WordTicker stepIndex={stepIndex} />}
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="tnum text-[13px] font-bold text-violet-ink">{percent}%</span>
          {line ? (
            <>
              <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
              <span className="tnum text-[13px] text-muted">{line}</span>
            </>
          ) : null}
        </div>

        <p className="mx-auto mt-5 max-w-[44ch] text-[12.5px] leading-relaxed text-faint">
          Close this tab if you like — the preview keeps generating on our side and will be
          waiting when you come back.
        </p>
      </div>
    </div>
  );
}
