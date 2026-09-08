'use client';

/**
 * The small pieces every page is built from.
 *
 * They are here rather than one-per-file because they are genuinely small and
 * because keeping them together is what stops a second, slightly different
 * button appearing on the fourth page. The rules they encode:
 *
 * - **A solid button is violet with near-black on it.** Not pink. Pink dark
 *   enough to carry text is maroon and stops being the logo's pink — the palette
 *   argument in `app/globals.css` and, at length, in `src/theme/tokens.ts`. The
 *   gradient is for surfaces that are already gestures.
 * - **Waiting for content is a skeleton, never a spinner.** A spinner says
 *   something is happening and nothing about what, and the page under it reflows
 *   completely the moment the data lands. `<Button loading>` is the exception,
 *   and it is a real one: an *action* in flight has no shape to stand in for.
 * - **A placeholder may state the layout, never the data.** Six cards is a fact
 *   about the screen. "0 styles" is a claim about an answer that has not
 *   arrived.
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'plain' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-violet text-on-violet hover:bg-violet-ink active:translate-y-px shadow-[0_10px_30px_-12px_rgb(var(--violet-rgb)/0.75)]',
  secondary:
    'bg-white/6 text-ink ring-1 ring-inset ring-line-strong hover:bg-white/10 hover:ring-white/25',
  ghost: 'text-ink-soft hover:text-ink hover:bg-white/6',
  plain: 'text-ink-soft hover:text-ink underline underline-offset-4 decoration-white/25',
  // The one destructive button. A variant rather than colour classes passed to
  // `secondary`, because an override handed in on `className` is a bet on which
  // of two utilities Tailwind emits last — and the whole reason these live in
  // one file is that the fourth page should not get its own slightly different
  // button. Nothing in the resting UI wears it: a red control is a warning about
  // something that has not happened yet, so it appears only inside the
  // confirmation, on the answer that does the deleting.
  danger:
    'bg-danger/12 text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/20 hover:ring-danger/45',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-[14px]',
  lg: 'h-13 px-7 text-[15px]',
};

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] ' +
  'transition-[background-color,color,box-shadow,transform] duration-200 ' +
  'disabled:pointer-events-none disabled:opacity-45';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  href,
  children,
  ...rest
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  if (href.startsWith('http') || href.startsWith('mailto:')) {
    return (
      <a {...rest} href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} href={href} className={classes}>
      {children}
    </Link>
  );
}

/**
 * The one spinner on the site, and only ever on an *action* in flight.
 *
 * A wait for content is drawn as the layout that is coming — that is `Skeleton`,
 * and the rule is not negotiable. A spinner is for the other case: something the
 * visitor set going whose outcome has no shape to stand in for yet. That is a
 * button mid-submit, and the pending tile on `/looks`, where the picture being
 * generated does not exist anywhere to be sketched.
 */
export function Spinner({
  size = 14,
  className = '',
}: {
  /**
   * Pixels, inline, rather than a size class the caller passes in: two `h-*`
   * utilities on one element are resolved by the order they land in the
   * stylesheet, not by the order they are written in the string, so an override
   * from a caller is a coin toss.
   */
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size, animation: 'luvo-spin 0.7s linear infinite' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Chips and badges
// ---------------------------------------------------------------------------

export function Chip({
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      aria-pressed={active}
      className={
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold ' +
        'transition-colors duration-200 ring-1 ring-inset ' +
        (active
          ? 'bg-violet/18 text-violet-ink ring-violet/45 '
          : 'bg-white/4 text-ink-soft ring-line hover:bg-white/8 hover:text-ink ') +
        className
      }
    >
      {children}
    </button>
  );
}

export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full bg-white/6 px-2.5 py-1 text-[11px] font-semibold ' +
        `uppercase tracking-[0.09em] text-muted ${className}`
      }
    >
      {children}
    </span>
  );
}

/** The small caps label that opens a section. */
export function Overline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-extrabold uppercase tracking-[0.22em] text-violet-ink ${className}`}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

/**
 * A block standing in for content that has not arrived.
 *
 * One shared keyframe, no delay, so every block on a page breathes in phase —
 * a dozen placeholders each pulsing from their own mount fan out into noise
 * within a second. It resolves to a still frame under reduced motion, which the
 * global rule in `globals.css` already does for every animation here.
 *
 * Nothing in it moves in a way that could be read as progress. There is none to
 * report while a fetch is in flight.
 *
 * `as` exists for the one case a block cannot cover: a placeholder standing in
 * for a word *inside* a sentence. A `<div>` in a `<p>` is invalid nesting, which
 * React reports as a hydration failure and then regenerates the whole tree on
 * the client — a real error rather than a tidiness note.
 */
export function Skeleton({
  className = '',
  as: Tag = 'div',
}: {
  className?: string;
  as?: 'div' | 'span';
}) {
  return (
    <Tag
      aria-hidden
      className={`rounded-lg bg-white/8 ${className}`}
      style={{ animation: 'luvo-breathe 2.2s ease-in-out infinite' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Section({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </section>
  );
}

export function Rule({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`rule-fade ${className}`} />;
}

/**
 * A state that is not a failure and not content: an empty search, a catalog that
 * could not be reached, a gallery with nothing in it yet.
 *
 * One component so all three read the same way — a line saying what happened,
 * and where possible a way out of it. An empty state with no exit is a dead end.
 */
export function Notice({
  title,
  body,
  action,
  tone = 'neutral',
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  /**
   * `good` was added for one message and is worth keeping to one: a payment that
   * went through. Everything else this component says is either neutral or a
   * warning, and a palette of four tones invites decorating ordinary states with
   * a colour that then means nothing when it is needed.
   */
  tone?: 'neutral' | 'good' | 'warn' | 'error';
}) {
  const ring =
    tone === 'error'
      ? 'ring-danger/35'
      : tone === 'warn'
        ? 'ring-amber/35'
        : tone === 'good'
          ? 'ring-jade/35'
          : 'ring-line';
  return (
    <div className={`rounded-[20px] bg-surface/70 px-6 py-8 text-center ring-1 ring-inset ${ring}`}>
      <p className="font-display text-[22px] leading-tight text-ink">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}
