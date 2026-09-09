'use client';

/**
 * The result, wiped against the original.
 *
 * A slider rather than two pictures side by side, because the question somebody
 * has at this moment is *did my face survive this* — and that is answered by the
 * two images occupying the same pixels, not by comparing them across a gutter.
 *
 * ## Both halves must be framed identically
 *
 * The one thing that can quietly ruin this. Both images are drawn `object-cover`
 * inside one box, so if the preview came back at a different aspect from the
 * photograph the two get cropped by different amounts — the head lands at a
 * different scale on each side of the wipe, and the model gets blamed for
 * zooming the photo when all it did was return the frame it was asked for.
 *
 * That is why `TRY_ON_IMAGE_SIZE` is `match` on the server: the output is
 * requested in the photograph's own shape, at a constant pixel budget so the
 * price tier does not move. This component is the reason that setting exists,
 * and the box's aspect is taken from the *original* so a model that ignores the
 * request is visibly wrong here rather than silently plausible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function BeforeAfter({
  before,
  after,
  alt,
  className = '',
}: {
  /** Object url of the photograph. Null when it was not kept. */
  before: string | null;
  after: string;
  alt: string;
  className?: string;
}) {
  const [position, setPosition] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPosition(Math.min(1, Math.max(0, (clientX - box.left) / box.width)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => moveTo(event.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, moveTo]);

  /**
   * The frame hugs the preview, and the preview is capped at the window.
   *
   * A portrait photograph at the container's full width is taller than the
   * viewport — a phone selfie at 720px wide is 960px tall — so the result
   * arrives scrolled off its own page, with the top of somebody's head behind
   * the header. Capping the *image* and letting the frame shrink to it (`w-fit`)
   * is what keeps the two layers pixel-aligned: the wipe's overlay is
   * `inset-0` on a box that is exactly the size of the image it is covering.
   */
  const FRAME = 'mx-auto w-fit overflow-hidden rounded-[24px] bg-surface ring-1 ring-inset ring-line';
  /**
   * The same cap the generating frame uses, and on a phone that is the point.
   *
   * It was `42svh` here against `58vh` there, on the argument that a preview
   * filling the screen pushes compare, download, share and the four cuts to try
   * next below the fold. The argument was about the *page*; what it did to the
   * *product* was worse. The wait shows somebody's photograph at the full width
   * of the column, and then the finished preview — the thing a credit was
   * actually spent on — arrived a third smaller in the same place. The picture
   * visibly shrinking at the moment of payoff reads as the result being a
   * lesser object than the placeholder that stood in for it, which is exactly
   * backwards.
   *
   * So the preview lands at the size it was generated at. What pays for it is
   * the scroll, and the row under it is one flick away rather than invisible.
   */
  const AFTER = 'block max-h-[58vh] w-auto max-w-full object-contain lg:max-h-[72vh]';

  // With nothing to wipe against there is no slider, and no pretence of one.
  if (!before) {
    return (
      <div className={`${FRAME} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={alt} className={AFTER} />
      </div>
    );
  }

  const percent = position * 100;

  return (
    <div
      ref={frame}
      className={
        `relative select-none ${FRAME} ` +
        `${dragging ? 'cursor-grabbing' : 'cursor-ew-resize'} ${className}`
      }
      onPointerDown={(event) => {
        setDragging(true);
        moveTo(event.clientX);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={alt} className={AFTER} draggable={false} />

      {/* The original, clipped to the left of the handle. Absolutely positioned
          over an identically sized box, so the two are pixel-aligned. */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* Labels, so the wipe reads without being touched. */}
      <span
        className={
          'pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] ' +
          'font-bold uppercase tracking-[0.1em] text-white backdrop-blur-sm transition-opacity duration-300'
        }
        style={{ opacity: position > 0.12 ? 1 : 0 }}
      >
        Before
      </span>
      <span
        className={
          'pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] ' +
          'font-bold uppercase tracking-[0.1em] text-white backdrop-blur-sm transition-opacity duration-300'
        }
        style={{ opacity: position < 0.88 ? 1 : 0 }}
      >
        After
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-white/85 shadow-[0_0_18px_rgb(0_0_0/0.6)]"
        style={{ left: `${percent}%` }}
      />

      {/*
        A real slider, not a decoration: it is focusable and takes arrow keys, so
        the comparison works without a pointer. The visible handle is the thumb's
        label rather than a second element pretending to be one.
      */}
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(event) => setPosition(Number(event.target.value) / 100)}
        aria-label="Wipe between your photo and the preview"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />

      <div
        aria-hidden
        className={
          'pointer-events-none absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 ' +
          'place-items-center rounded-full bg-white/95 text-[13px] font-bold text-on-plate-ink ' +
          'shadow-[0_6px_20px_rgb(0_0_0/0.5)]'
        }
        style={{ left: `${percent}%` }}
      >
        ⟺
      </div>
    </div>
  );
}
