'use client';

/**
 * Sign-in without a provider: an address, a six-digit code, no password.
 *
 * This is the whole of sign-in in a deployment with **no Clerk keys at all** —
 * a fresh checkout of this repository, and the sandbox, which is a whole backend
 * in memory with no keys of any kind. It talks to `/v1/account/email-code` and
 * signs in as provider `email`. Where Clerk *is* configured, `<AuthScreen>`
 * mounts Clerk's own card instead and this is not rendered: accounts are keyed
 * on `(provider, subject)` and never on email — see `server/src/accounts.ts` —
 * so offering both at once would hand somebody two accounts for one address and
 * split their credits between them with nothing on screen explaining why.
 *
 * It was the body of a modal, `<SignInDialog>`, and it is a page now. The
 * argument for the modal was real and is written down in `docs/web.md`: a
 * two-field errand answered with a navigation loses the cut, the length and the
 * texture somebody had set up. What replaced it keeps the destination instead —
 * every door into `/sign-in` carries the path it was pressed on, and the way
 * back is the first thing that happens after a successful sign-in.
 *
 * Nothing here stores a token, because there is none. Signing in adopts this
 * browser's device secret server-side; see `lib/state/AccountContext.tsx`.
 */

import { useEffect, useRef, useState } from 'react';

import { ApiError, requestEmailCode } from '../../lib/api';
import { useAccount } from '../../lib/state/AccountContext';
import { Button } from '../ui';

const CODE_LENGTH = 6;

/** What a completed sign-in has to say, whichever form produced it. */
export interface Done {
  email: string | null;
  total: number;
  bonus: boolean;
}

/**
 * What went wrong, in words the visitor can act on.
 *
 * The server's own `message` is used wherever it has one — "that code is not
 * right", "that code has expired — ask for a new one" — because those are
 * written for this screen, and a generic "sign-in failed" would throw away the
 * one thing that tells somebody what to do next. Only the failures that are
 * about *this deployment* rather than about the visitor are reworded, since the
 * server phrases those for an operator.
 *
 * There is nothing about Clerk in here any more. This dialog is only reached
 * when there are no Clerk keys at all, so every failure it can see comes from
 * our own API.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'offline') {
      return 'Louvo could not be reached. Check your connection and try again.';
    }
    if (error.code === 'email_unconfigured' || error.code === 'email_failed') {
      return 'Sign-in email is not working on this deployment. Nothing you did — try again shortly.';
    }
    if (error.code === 'device_required') {
      return 'This browser is not keeping its Louvo key, so there is nothing to sign in. That is a private window, or site data turned off.';
    }
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const FIELD =
  'mt-2 h-12 w-full rounded-2xl bg-white/5 px-4 text-[15px] text-ink outline-none ' +
  'ring-1 ring-inset ring-line transition-shadow placeholder:text-faint focus:ring-2 focus:ring-violet/60';

const CODE_FIELD =
  'tnum mt-2 h-14 w-full rounded-2xl bg-white/5 px-5 text-center text-[26px] ' +
  'tracking-[0.4em] text-ink outline-none ring-1 ring-inset ring-line ' +
  'transition-shadow placeholder:text-faint focus:ring-2 focus:ring-violet/60';

function ErrorLine({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-3 text-[12.5px] leading-relaxed text-danger">
      {children}
    </p>
  );
}

/**
 * The reason to bother, stated where the decision is made rather than on a page
 * somebody has to go and find — the same argument the upload box makes about the
 * photograph.
 */
function WhyBother() {
  return (
    <p className="mt-6 border-t border-line pt-5 text-[12.5px] leading-relaxed text-faint">
      You do not need an account to try a haircut on. One exists so that credits you have paid for
      are not lost when you clear this browser or move to another device — and signing up adds a
      free preview. Your address is used to sign you in and for nothing else.
    </p>
  );
}

/**
 * The mailed code against our own API, for a deployment with no Clerk keys.
 *
 * This is what keeps a fresh checkout and the sandbox able to sign in at all —
 * it needs no third-party script, no publishable key and no redirect, and with
 * `EMAIL_DEV_ECHO` it needs no mail provider either. It signs in as provider
 * `email`, which is a different identity from a Clerk one for the same address;
 * that is exactly why it is a fallback rather than a second option offered
 * beside Google. See the header.
 */
export function EmailCodeForm({ onDone }: { onDone: (done: Done) => void }) {
  const { signIn } = useAccount();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  /** Only ever set by a deployment that echoes codes instead of mailing them. */
  const [echoed, setEchoed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sent) codeField.current?.focus();
  }, [sent]);

  async function send(address: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await requestEmailCode(address);
      setSent(address);
      setEchoed(!!result.devCode);
      // Prefilled rather than merely printed: a code the server handed back is a
      // code there is no point making somebody retype.
      if (result.devCode) setCode(result.devCode);
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!sent) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(sent, code.trim());
      onDone({
        email: result.account?.email ?? sent,
        total: result.credits.total,
        bonus: !!result.bonusGranted,
      });
    } catch (failure) {
      setError(messageFor(failure));
      setCode('');
      codeField.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitCode();
        }}
      >
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          A six-digit code is on its way to <span className="text-ink-soft">{sent}</span>. It is
          good for ten minutes.
        </p>

        <label htmlFor="sign-in-code" className="mt-6 block text-[12px] font-semibold text-faint">
          Your code
        </label>
        <input
          id="sign-in-code"
          ref={codeField}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          className={CODE_FIELD}
        />

        {echoed ? (
          <p className="mt-3 text-[12px] leading-relaxed text-amber">
            This deployment hands codes back instead of mailing them, so it has been filled in for
            you. That is a development setting and it is refused wherever mail works.
          </p>
        ) : null}

        {error ? <ErrorLine>{error}</ErrorLine> : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" size="sm" loading={busy} disabled={code.length !== CODE_LENGTH}>
            Sign in
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send(sent)}
            className="text-[12.5px] text-muted underline underline-offset-4 hover:text-ink disabled:opacity-45"
          >
            Send it again
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSent(null);
              setCode('');
              setEchoed(false);
              setError(null);
            }}
            className="text-[12.5px] text-muted underline underline-offset-4 hover:text-ink disabled:opacity-45"
          >
            Use a different address
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send(email.trim().toLowerCase());
      }}
    >
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
        There is no password. Give us your email and a six-digit code comes back — if the address is
        new, that code creates the account.
      </p>

      <label htmlFor="sign-in-email" className="mt-6 block text-[12px] font-semibold text-faint">
        Email
      </label>
      <input
        id="sign-in-email"
        autoFocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        className={FIELD}
      />

      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <div className="mt-6">
        <Button type="submit" size="sm" loading={busy} disabled={!email.includes('@')}>
          Email me a code
        </Button>
      </div>

      <WhyBother />
    </form>
  );
}
