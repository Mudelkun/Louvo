'use client';

/**
 * The hero's evidence: real faces, wiped between the photograph and the preview.
 *
 * This is the single most important object on the site, and it is the one thing
 * a paragraph cannot do. The objection that stops somebody is *this will not
 * look like me* — not "how does it work" — and the only answer to it is a real
 * before and a real after, on the same head, seen changing.
 *
 * ## It plays by itself, and that reverses an earlier decision
 *
 * This frame was built to move only when it was pushed, first by a drag and then
 * by the cursor, on the argument that a comparison the visitor performs is
 * evidence and a comparison performed *at* them is an advertisement. That
 * argument was not wrong, but it assumed the comparison happens — and both
 * versions made the same bet, that somebody who has been on the page for four
 * seconds will work out that a picture is interactive and choose to test it.
 * Most do not. A hero that has to be discovered is a hero that is mostly missed,
 * and evidence nobody looks at loses to an advertisement everybody sees.
 *
 * So the seam sweeps on its own and the set rotates, and the visitor is handed
 * the controls the moment they show any interest in them:
 *
 * - **The pointer takes over while it is over the picture**, immediately and
 *   completely, and the loop stops dead. Hovering a thing that keeps moving on
 *   its own is the actual insult here — not the autoplay, but autoplay that
 *   ignores you.
 * - **Leaving hands it back without a jump.** The loop is re-entered at the
 *   phase whose position is nearest wherever the seam was left (`phaseNearest`),
 *   so it picks up from the visitor's hand rather than snapping to whatever the
 *   clock would have reached. A touch does the same on release.
 * - **Choosing a face stops the rotation for good.** A choice outranks a
 *   demonstration — the same rule `<HairTypeChoice>` follows in the app — so a
 *   tapped thumbnail pins the set. The sweep continues, because the sweep *is*
 *   the evidence and freezing it would leave a still photograph behind as a
 *   reward for having pressed something.
 * - **Reduced motion means none of it.** No sweep, no rotation: the seam sits at
 *   rest and moves only for a pointer. This is decorative motion by any honest
 *   reading, and it is the whole thing that gets switched off.
 *
 * What survives from the old rule, and should: the loop is **paced to be read,
 * not to be impressive**. It parks on the original, sweeps once, and then holds
 * on the finished cut for a beat and a half — the hold is the payoff and it is
 * the longest still moment in the cycle. A seam oscillating continuously would
 * be a screensaver.
 *
 * ## Why it takes a set of pairs rather than one
 *
 * A single before/after answers *will this look like me* for exactly one person,
 * and the visitor is not that person. One woman with long straight hair is
 * evidence about long straight hair; somebody with a type 4 coil reads the same
 * picture as a promise made to somebody else. So the hero rotates through a set
 * — other faces, other textures, both genders — and a visitor who waits sees all
 * of them without touching anything.
 *
 * The set costs `CYCLE` seconds per face to come round, so its size is bounded
 * by the clock rather than by taste: past five or six the last faces are being
 * played to somebody who has already scrolled. `public/hero/README.md` says so
 * beside the files.
 *
 * It is still one wipe at a time. Three frames side by side would be a contact
 * sheet, which is what `<HeroPlates>` already is and the weaker of the two
 * heroes; the moving seam is the whole reason this is evidence rather than
 * decoration.
 *
 * ## Why it is not `<BeforeAfter>`
 *
 * That component is the result page's, and its constraints are the result
 * page's: `w-fit` around an `object-contain` image capped at `72vh`, so the
 * frame takes the shape of whatever the model returned and a portrait preview
 * does not arrive scrolled off its own page. A hero needs the opposite — a fixed
 * frame that fills its column whatever the files happen to be — so the two are
 * separate on purpose. Do not merge them; you would have to give one of them the
 * other's sizing and the result page's argument about matched aspects is
 * load-bearing.
 *
 * ## Both images in a pair must be the same face, framed the same way
 *
 * The pairs are curated rather than generated at runtime, and that is the whole
 * risk: two shots of one person at even slightly different crops read, under a
 * wipe, as the model having moved the head — and autoplay makes that worse, not
 * better, because the visitor now sees the mismatch whether they looked for it
 * or not. Shoot the *after* as a real preview from the *before* and export both
 * at one size. `public/hero/README.md` says so next to the files.
 *
 * ## Why the face changes at the far end of the sweep
 *
 * The rotation fires at the top of the cycle, where the seam is parked with the
 * *before* covering the whole frame — so the swap is one person's photograph
 * dissolving into the next person's photograph, and the new cut is then revealed
 * by the sweep rather than arriving pre-revealed. Both planes cross-fade, not
 * just the visible one: the after is hidden behind the before at that instant,
 * but a visitor whose pointer enters mid-dissolve would otherwise pull the seam
 * across and find the next person's finished cut already sitting under the last
 * person's photograph.
 *
 * ## Why the seam is driven through refs rather than through state
 *
 * The loop produces a new position every frame, and a `useState` behind that is
 * a React render of the whole hero — six images, a thumbnail row, two labels —
 * sixty times a second to move one edge. The animation frame writes `clipPath`,
 * `left` and `opacity` onto nodes held by ref. The only state is which pair is
 * showing and which is dissolving out, both of which change every few seconds
 * rather than every frame. The rest position is plain inline style, so the
 * server renders the frame parked on the photograph with nothing to correct on
 * hydration.
 *
 * The loop also stops when the hero is not on screen — an `IntersectionObserver`
 * rather than a permanent `requestAnimationFrame`, because a page whose front
 * door animates forever while the visitor reads the catalogue below it is
 * spending somebody's battery on a picture nobody is looking at.
 *
 * ## The one thing that is easy to get wrong on a phone
 *
 * A full-frame pointer target on a touch screen is a full-frame *scroll* trap.
 * The hero is around half a phone screen tall, so a thumb starting a downward
 * swipe inside it has to still scroll the page. `touch-action: pan-y` is what
 * says so: the browser keeps vertical panning for itself and hands us horizontal
 * movement. It has to be on the invisible range input as well as on the figure,
 * since the input is the element the thumb actually lands on and a range input
 * left to itself will consume a vertical swipe to set its own value. Without
 * both, the front page cannot be scrolled past on a phone — which is the worst
 * bug this component is in a position to have.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface HeroImages {
  before: string;
  after: string;
}

/**
 * The cycle, in milliseconds. One pass per face.
 *
 * The shape matters more than the numbers: park on the photograph long enough to
 * be read as a photograph, sweep once, then **hold on the finished cut longer
 * than anything else in the cycle** — that hold is the product, and a seam that
 * swept straight back would be showing it off rather than showing it. The return
 * is quicker than the reveal for the same reason: nobody needs to study the
 * original twice.
 */
const PARK_BEFORE = 950;
const SWEEP_IN = 1300;
const HOLD_AFTER = 1150;
const SWEEP_OUT = 900;
const CYCLE = PARK_BEFORE + SWEEP_IN + HOLD_AFTER + SWEEP_OUT;

/**
 * How long one face dissolves into the next.
 *
 * It **must fit inside `PARK_BEFORE`**, and that is a real constraint rather than
 * a tidiness one: the dissolve is only invisible because the seam is parked with
 * the photograph covering the frame while it runs. A cross-fade still going when
 * the reveal starts would be two people's hair moving at once.
 */
const CROSSFADE = 550;

/** Where the seam rests when there is no loop: both halves, both labels. */
const REST = 0.5;

/**
 * The follow lag, in milliseconds, as the time constant of an exponential ease.
 *
 * It smooths the loop and the cursor alike, which is why the handover between
 * them is invisible. Around 70ms is the width of the window where the seam reads
 * as being *pulled* rather than either teleported or towed.
 */
const FOLLOW_MS = 70;

/** 1 is the photograph filling the frame; 0 is the preview filling it. */
function seamAt(withinCycle: number): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  let t = withinCycle;
  if (t < PARK_BEFORE) return 1;
  t -= PARK_BEFORE;
  if (t < SWEEP_IN) return 1 - smooth(t / SWEEP_IN);
  t -= SWEEP_IN;
  if (t < HOLD_AFTER) return 0;
  t -= HOLD_AFTER;
  return smooth(Math.min(1, t / SWEEP_OUT));
}

/**
 * The point in the cycle that best matches a seam the visitor left somewhere.
 *
 * Sampled rather than inverted: `seamAt` is piecewise and its two sweeps each
 * hit every value once, so an exact inverse would have to pick between two
 * correct answers anyway. A hundred and twenty samples, once per pointer-leave,
 * is nothing — and it is what makes the loop resume *from the visitor's hand*
 * instead of snapping to wherever the clock had got to while they held it.
 */
function phaseNearest(value: number): number {
  let best = 0;
  let closest = Infinity;
  for (let i = 0; i < 120; i += 1) {
    const t = (i / 120) * CYCLE;
    const distance = Math.abs(seamAt(t) - value);
    if (distance < closest) {
      closest = distance;
      best = t;
    }
  }
  return best;
}

export function HeroCompare({ images }: { images: HeroImages[] }) {
  const [index, setIndex] = useState(0);
  /** The face dissolving out, mounted only for the length of a cross-fade. */
  const [outgoing, setOutgoing] = useState<HeroImages | null>(null);

  const frame = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const beforeLabel = useRef<HTMLSpanElement>(null);
  const afterLabel = useRef<HTMLSpanElement>(null);
  const slider = useRef<HTMLInputElement>(null);

  /** Where the seam is being asked to go, and where it currently is. */
  const target = useRef(1);
  const shown = useRef(1);
  const request = useRef<number | null>(null);
  const last = useRef(0);

  /** The loop's clock, and which cycle it has reached. */
  const started = useRef(0);
  const cycle = useRef(0);

  const hovering = useRef(false);
  const held = useRef(false);
  /** On screen, so worth animating. Set by the observer below. */
  const onScreen = useRef(false);
  /** A face was chosen by hand, so the set stops rotating. */
  const pinned = useRef(false);

  const indexRef = useRef(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  /**
   * Read once rather than per frame: `matchMedia` inside the animation loop
   * would be a media query evaluated sixty times a second to answer a question
   * that changes about never.
   */
  const still = useRef(false);

  const paint = useCallback((at: number) => {
    const percent = at * 100;
    if (clip.current) clip.current.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    if (line.current) line.current.style.left = `${percent}%`;
    if (handle.current) handle.current.style.left = `${percent}%`;
    if (beforeLabel.current) beforeLabel.current.style.opacity = at > 0.14 ? '1' : '0';
    if (afterLabel.current) afterLabel.current.style.opacity = at < 0.86 ? '1' : '0';
    // Kept in step so a visitor who tabs to the slider picks up the arrow keys
    // where the seam actually is.
    if (slider.current) slider.current.value = String(percent);
  }, []);

  /** Move the set on one face, dissolving rather than cutting. */
  const advance = useCallback(() => {
    const set = imagesRef.current;
    if (set.length < 2) return;
    const from = indexRef.current;
    const to = (from + 1) % set.length;
    indexRef.current = to;
    setOutgoing(set[from]);
    setIndex(to);
  }, []);

  const pump = useCallback(() => {
    if (request.current !== null) return;
    last.current = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(now - last.current, 64);
      last.current = now;

      const driving = hovering.current || held.current;
      const playing = onScreen.current && !still.current && !driving;

      if (playing) {
        const total = now - started.current;
        const reached = Math.floor(total / CYCLE);
        if (reached !== cycle.current) {
          cycle.current = reached;
          if (!pinned.current) advance();
        }
        target.current = seamAt(total % CYCLE);
      }

      const distance = target.current - shown.current;
      if (still.current || Math.abs(distance) < 0.0004) {
        shown.current = target.current;
      } else {
        // Time-based rather than a fixed fraction per frame, so the glide takes
        // the same 70ms on a 120Hz display as on a 60Hz one.
        shown.current += distance * (1 - Math.exp(-elapsed / FOLLOW_MS));
      }
      paint(shown.current);

      const settled = Math.abs(target.current - shown.current) < 0.0004;
      if (!playing && !driving && settled) {
        request.current = null;
        return;
      }
      request.current = requestAnimationFrame(step);
    };
    request.current = requestAnimationFrame(step);
  }, [advance, paint]);

  /** Re-enter the loop where the seam already is, so nothing jumps. */
  const handBack = useCallback(() => {
    if (still.current) {
      // There is no loop to hand back to, so the seam goes to the one position
      // that shows both halves rather than staying wherever a cursor left it.
      target.current = REST;
      pump();
      return;
    }
    started.current = performance.now() - phaseNearest(shown.current);
    cycle.current = 0;
    pump();
  }, [pump]);

  const aim = useCallback(
    (clientX: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      target.current = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      pump();
    },
    [pump],
  );

  useEffect(() => {
    still.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (still.current) {
      // Nothing will drive it, so put it somewhere both halves are legible.
      target.current = REST;
      shown.current = REST;
      paint(REST);
    }

    // Before anything can read the clock. The observer below sets it again on
    // the first intersection, but its callback is asynchronous, and a frame that
    // ran against a clock of zero would compute a cycle number in the millions
    // and fire a face change on its first tick.
    started.current = performance.now();

    // A finger that lifts outside the frame, or a swipe the browser turns into a
    // scroll, both end the hold — and neither is an event the figure will see.
    const release = () => {
      if (!held.current) return;
      held.current = false;
      handBack();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    const node = frame.current;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        if (visible && !onScreen.current) {
          // Start the cycle from the top rather than mid-sweep, so a visitor
          // who scrolls back up gets the photograph first and not the tail of a
          // reveal they never saw the beginning of.
          started.current = performance.now();
          cycle.current = 0;
        }
        onScreen.current = visible;
        if (visible) pump();
      },
      { threshold: 0.25 },
    );
    if (node) watcher.observe(node);

    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      watcher.disconnect();
      if (request.current !== null) cancelAnimationFrame(request.current);
    };
  }, [handBack, paint, pump]);

  /** The dissolving face is unmounted once it has finished dissolving. */
  useEffect(() => {
    if (!outgoing) return;
    const timer = window.setTimeout(() => setOutgoing(null), CROSSFADE);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  /**
   * The faces that are not on screen, warmed once the page is up.
   *
   * Rendering all of them would put six files in the hero's critical path in
   * order to leave four of them invisible. Fetching them after mount keeps first
   * paint at two — and with the set rotating on its own, every one of them is
   * going to be needed within twenty seconds whether anybody asks or not.
   */
  useEffect(() => {
    if (images.length < 2) return;
    for (const entry of images) {
      for (const src of [entry.before, entry.after]) {
        const img = new window.Image();
        img.src = src;
      }
    }
  }, [images]);

  const pair = images[Math.min(index, images.length - 1)];

  return (
    <div>
      <figure
        ref={frame}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          hovering.current = true;
          aim(event.clientX);
        }}
        onPointerMove={(event) => {
          // A touch moves the seam only while it is held down; a cursor moves it
          // by being over the picture at all.
          if (event.pointerType === 'touch' && !held.current) return;
          if (event.pointerType !== 'touch') hovering.current = true;
          aim(event.clientX);
        }}
        onPointerDown={(event) => {
          held.current = true;
          aim(event.clientX);
        }}
        onPointerLeave={(event) => {
          // Hand the loop back — but only for a pointer that can hover. A finger
          // has no "leaving"; its release is handled by the window listener.
          if (event.pointerType === 'touch') return;
          hovering.current = false;
          handBack();
        }}
        style={{ touchAction: 'pan-y' }}
        className={
          'relative aspect-[4/5] w-full select-none overflow-hidden rounded-[24px] bg-surface ' +
          'ring-1 ring-inset ring-white/10 shadow-[0_40px_100px_-45px_rgb(0_0_0/0.95)] ' +
          'cursor-ew-resize'
        }
      >
        {/* The after plane, full frame. The before plane is clipped over it, so
            the wipe is one moving edge rather than two elements chasing each
            other — and each plane cross-fades on its own when the face changes,
            so a pointer arriving mid-dissolve cannot pull the seam across and
            find the next person already behind it. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a local file at a
            fixed size; the optimiser has nothing to add and would proxy it. */}
        <img
          key={pair.after}
          src={pair.after}
          alt="The same person after a Luvo preview, wearing a different haircut"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        {outgoing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`out-${outgoing.after}`}
            src={outgoing.after}
            alt=""
            aria-hidden
            className="animate-fade-out pointer-events-none absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : null}

        <div
          ref={clip}
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: 'inset(0 0% 0 0)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={pair.before}
            src={pair.before}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          {outgoing ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`out-${outgoing.before}`}
              src={outgoing.before}
              alt=""
              aria-hidden
              className="animate-fade-out pointer-events-none absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : null}
        </div>

        {/* The labels fade out as the edge reaches them, so neither ever sits over
            the half it does not describe. */}
        <span ref={beforeLabel} className={LABEL + ' left-3 top-3'} style={{ opacity: 1 }}>
          Before
        </span>
        <span ref={afterLabel} className={LABEL + ' right-3 top-3'} style={{ opacity: 0 }}>
          After
        </span>

        <div
          ref={line}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-white/85 shadow-[0_0_18px_rgb(0_0_0/0.6)]"
          style={{ left: '100%' }}
        />
        <div
          ref={handle}
          aria-hidden
          className={
            'pointer-events-none absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 ' +
            'place-items-center rounded-full bg-white/95 text-[13px] font-bold text-on-plate-ink ' +
            'shadow-[0_6px_20px_rgb(0_0_0/0.5)]'
          }
          style={{ left: '100%' }}
        >
          ⟺
        </div>

        {/* A real slider, not a decoration: focusable and takes arrow keys, so the
            comparison works without a pointer at all. Uncontrolled, because the
            animation frame is what writes its value — handing it React state
            would put a render of the whole hero behind every frame of the loop. */}
        <input
          ref={slider}
          type="range"
          min={0}
          max={100}
          defaultValue={100}
          onChange={(event) => {
            // Keyboard use is deliberate use: it stops the loop the way a hover
            // does, and the blur hands it back.
            hovering.current = true;
            target.current = Number(event.target.value) / 100;
            pump();
          }}
          onBlur={() => {
            hovering.current = false;
            handBack();
          }}
          aria-label="Wipe between the original photo and the preview"
          style={{ touchAction: 'pan-y' }}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </figure>

      {/* The other faces. The set reaches all of them on its own, so this row is
          an override rather than the way through — and pressing it *pins* the
          set, because a choice outranks a demonstration. Below the frame rather
          than over it: an overlay would cover the one thing the frame is for,
          and would sit exactly where a cursor sweeps and a thumb comes down. */}
      {images.length > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          {images.map((entry, entryIndex) => (
            <button
              key={entry.after}
              type="button"
              onClick={() => {
                pinned.current = true;
                if (entryIndex === indexRef.current) return;
                setOutgoing(images[indexRef.current]);
                indexRef.current = entryIndex;
                setIndex(entryIndex);
                // From the top, so the chosen face is shown as a photograph
                // first and then revealed, exactly as the loop would have.
                started.current = performance.now();
                cycle.current = 0;
                target.current = 1;
                pump();
              }}
              aria-label={`Show example ${entryIndex + 1} of ${images.length}`}
              aria-pressed={entryIndex === index}
              className={
                'h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface ' +
                'transition duration-300 [transition-timing-function:var(--ease-out-quint)] ' +
                (entryIndex === index
                  ? 'ring-2 ring-violet-ink ring-offset-2 ring-offset-canvas'
                  : 'opacity-55 ring-1 ring-inset ring-white/15 hover:opacity-100 hover:ring-white/40')
              }
            >
              {/* The *after* is the thumbnail. The row is being used to find a
                  face, and the after is what that face is here to show. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.after}
                alt=""
                aria-hidden
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* The claim, and the one thing the moving picture cannot say about itself:
          that it will stop and do as it is told. */}
      <p className="mt-3 text-center text-[12px] text-muted">
        {images.length > 1 ? 'Real previews' : 'A real preview'}, generated by Luvo — move across
        the picture to take over
      </p>
    </div>
  );
}

const LABEL =
  'pointer-events-none absolute rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-bold ' +
  'uppercase tracking-[0.1em] text-white backdrop-blur-sm transition-opacity duration-300';
