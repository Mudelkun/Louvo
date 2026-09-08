'use client';

/**
 * Signing in is a page, and this is it.
 *
 * ## Why it stopped being a modal
 *
 * It was `<SignInDialog>` and Clerk's `openSignIn()` — a card over whatever
 * the visitor was doing. The argument for that is written down in `docs/web.md`
 * and it was a real one: somebody standing on a cut with their photograph
 * loaded should not have a two-field errand answered by a navigation that loses
 * the cut, the length and the texture. It is not what it cost, though. A modal
 * puts the most consequential form on the site into a box that can be dismissed
 * by a stray click, has no url to come back to, cannot be linked to from an
 * email, and — with Clerk's own card inside it — arrives as a second, differently
 * shaped surface floating over the page with the page still visible behind it.
 * The complaint that ended it was the plainest possible one: it reads as
 * something that has interrupted you, not as somewhere you have gone.
 *
 * So it is `/sign-in` and `/sign-up`, and the thing the modal was protecting is
 * kept a different way: **every door into these pages carries the path it was
 * pressed on** as `?next=`, and that is where the visitor is put back. See
 * `useReturnPath` in `components/AuthButtons.tsx`.
 *
 * One honest limit, because it is the part the modal genuinely did better: a
 * photograph that has been *uploaded but not yet submitted* lives in this tab's
 * memory as an object url, so it does not survive the trip. The two answers on
 * that page — the cut, the length, the texture — are in the session and do come
 * back.
 *
 * ## One column, centred
 *
 * There was a second column beside the form — what Luvo is, in three points —
 * on the argument that a sign-in page is often the first page somebody sees and
 * a lone card says nothing about what is being signed into. It is gone, and the
 * copy that goes there is still being decided; the page is the form alone,
 * centred, until there is something worth putting beside it. Anything that does
 * go there belongs in this file's own column, not inside Clerk's card.
 *
 * ## Clerk draws its own card, and we do not restyle it
 *
 * The card carries its own title, its own subtitle and its own back link between
 * steps, so there is no heading of ours above it — two headings would be one
 * question asked twice, and hiding Clerk's `header` element to fix that would
 * also hide the back link on the verification step. `appearance` is set once on
 * `<ClerkProvider>` in `app/providers.tsx`, in Luvo's palette, and this passes
 * nothing but the two layout boxes. The page's own `h1` is the right column's.
 */

import { SignIn, SignUp } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { hasApi, hasClerk } from '../../lib/config';
import { useAccount } from '../../lib/state/AccountContext';
import { Button, ButtonLink, Notice, Overline, Skeleton } from '../ui';
import { EmailCodeForm, type Done } from './EmailCodeForm';

export type AuthMode = 'sign-in' | 'sign-up';

/**
 * Where to put the visitor back, and the one rule about it.
 *
 * A *path*, never a url, and refused unless it starts with a single `/`. This is
 * the same rule `server/src/checkout.ts` applies to Stripe's return: a
 * destination that arrives in a query string is attacker-controlled, and
 * `//evil.example` is a perfectly good url that leaves the site. Refused rather
 * than sanitised, because a half-cleaned redirect target is the bug that keeps
 * coming back.
 */
export function safeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-24 pt-10 sm:px-6 lg:pt-16">
      <AuthCard mode={mode} next={next} />
    </main>
  );
}

/**
 * The layout, with nothing in it yet.
 *
 * Served until the client picks the route up, since reading `?next=` takes the
 * tree out of the static render. It states the shape — a card on the left, a
 * heading and three points on the right — and nothing about what will be in
 * them, which is the rule every placeholder on the site follows.
 */
export function AuthScreenSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[440px] px-5 pb-24 pt-10 sm:px-6 lg:pt-16">
      <Skeleton className="h-[420px] w-full rounded-[24px]" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whichever of the four things this deployment and this browser can actually
 * offer: Clerk's card, our mailed code, a reason neither is possible, or the
 * fact that the visitor is already signed in.
 *
 * The last one is not a nicety. Reaching `/sign-in` with a session — a
 * bookmark, a back button, a second tab — used to be Clerk answering every
 * attempt with `session_exists` and no way forward from either side. Saying so,
 * and offering the way back, is the whole fix.
 */
function AuthCard({ mode, next }: { mode: AuthMode; next: string }) {
  const { account, credits, ready, usable } = useAccount();

  if (!hasApi) {
    return (
      <Notice
        tone="warn"
        title="No service configured"
        body="This build has no NEXT_PUBLIC_API_URL, so there is nothing to sign into. Everything else on the site works."
      />
    );
  }

  if (!usable) {
    return (
      <Notice
        tone="warn"
        title="This browser cannot be identified"
        body="Luvo keeps a random key in this browser's storage so it knows which previews are yours, and signing in attaches an account to that key. Storage is blocked here — a private window, or site data turned off — so there is nothing to attach."
      />
    );
  }

  // `ready` is the same gate the header uses before it draws Sign in: the
  // account arrives with the first successful read, so anything drawn before
  // then is a guess about somebody who may already be signed in.
  if (ready && credits.signedIn) {
    return (
      <Panel>
        <Overline>Account</Overline>
        <h1 className="mt-3 font-display text-[clamp(1.5rem,4.5vw,1.9rem)] leading-tight text-ink">
          You are already signed in.
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          {account?.email ? (
            <>
              As <span className="text-ink-soft">{account.email}</span>. Your credits are on this
              account, so they follow you to another browser or to the app.
            </>
          ) : (
            'Your credits are on this account, so they follow you to another browser or to the app.'
          )}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={next} size="sm">
            Back to it
          </ButtonLink>
          <ButtonLink href="/account" size="sm" variant="secondary">
            Previews and packs
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  return hasClerk ? <ClerkCard mode={mode} next={next} /> : <EmailCard next={next} />;
}

/**
 * Clerk's own card, mounted on this route rather than opened over a page.
 *
 * `fallbackRedirectUrl` rather than `forceRedirectUrl`: Clerk honours a
 * destination it has already decided on — the tail of an SSO round trip, a
 * verification step — and falls back to ours, which is where the visitor was.
 * The cross-link between the two cards carries `next` with it, so pressing "Sign
 * up" from a sign-in that was started on a haircut still comes back to that
 * haircut.
 *
 * Nothing here adopts the device. `<ClerkBridge>` does that by noticing on the
 * destination page that Clerk has a session the API has not been told about —
 * see that file for why reconciling beats reacting to a redirect.
 */
function ClerkCard({ mode, next }: { mode: AuthMode; next: string }) {
  const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  const appearance = { elements: { rootBox: 'w-full', cardBox: 'w-full' } };

  return mode === 'sign-up' ? (
    <SignUp
      appearance={appearance}
      signInUrl={`/sign-in${query}`}
      fallbackRedirectUrl={next}
      signInFallbackRedirectUrl={next}
    />
  ) : (
    <SignIn
      appearance={appearance}
      signUpUrl={`/sign-up${query}`}
      fallbackRedirectUrl={next}
      signUpFallbackRedirectUrl={next}
    />
  );
}

/**
 * The mailed code, in a card of our own, for a deployment with no Clerk keys.
 *
 * It ends on the balance rather than on a redirect, and that is deliberate: a
 * first sign-in carries the welcome credit, and a credit that arrives while the
 * page is navigating is a credit nobody knows they have. "Back to it" is the
 * visitor saying they have read it, which is exactly when to continue.
 */
function EmailCard({ next }: { next: string }) {
  const router = useRouter();
  const [done, setDone] = useState<Done | null>(null);

  return (
    <Panel>
      <Overline>{done ? 'Signed in' : 'Account'}</Overline>
      <h1 className="mt-3 font-display text-[clamp(1.5rem,4.5vw,1.9rem)] leading-tight text-ink">
        {done ? 'You are signed in.' : 'Sign in or create an account.'}
      </h1>

      {done ? (
        <>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            {done.email ? (
              <>
                Signed in as <span className="text-ink-soft">{done.email}</span>.{' '}
              </>
            ) : null}
            {done.bonus
              ? 'A preview has been added for signing up, and your credits now follow the account rather than this browser.'
              : 'Your credits are on this account, so they follow you to another browser or to the app.'}
          </p>
          <p className="tnum mt-6 font-display text-[34px] leading-none text-ink">
            {done.total} {done.total === 1 ? 'preview' : 'previews'}
          </p>
          <div className="mt-7">
            <Button size="sm" autoFocus onClick={() => router.push(next)}>
              Back to it
            </Button>
          </div>
        </>
      ) : (
        <EmailCodeForm onDone={setDone} />
      )}
    </Panel>
  );
}

/** The ground our own cards sit on, shaped like the one Clerk draws in its place. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] bg-canvas-raised p-6 ring-1 ring-inset ring-line sm:p-7">
      {children}
    </div>
  );
}
