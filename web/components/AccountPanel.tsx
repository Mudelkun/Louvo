'use client';

/**
 * The account surface, and an honest account of what is behind it.
 *
 * Sign-in is not implemented — Clerk is the plan — and this page says that in
 * words rather than showing a button that does nothing. That is the same rule
 * the rest of the client follows: a degraded state is reported, never disguised.
 *
 * ## What signing in will and will not do
 *
 * Worth stating on the page itself, because the usual expectation is wrong here.
 * An account exists **only so purchased credits survive a device** — it is not
 * where the looks live, and it is not a profile. Signing in *adopts this
 * browser* rather than issuing a second token: the server sets `devices.user_id`
 * on the device it already trusts, which is the column `003_previews.sql`
 * created on day one with a comment predicting exactly this. There is no session
 * token to expire, refresh, or get out of step with the device.
 *
 * The free allowance is the honest asterisk. On a phone the device secret lives
 * in the platform keystore and survives a reinstall; in a browser it is
 * `localStorage`, which a private window does not have and clearing site data
 * removes. So the two free previews are weaker here, and the page says so rather
 * than letting somebody discover it.
 */

import { useEffect, useState } from 'react';

import { fetchCreditHistory, type CreditHistoryEntry } from '../lib/api';
import { hasApi, hasClerk } from '../lib/config';
import { deviceSecret } from '../lib/device';
import { useAccount } from '../lib/state/AccountContext';
import { Pricing } from './Pricing';
import { Button, ButtonLink, Notice, Overline, Rule, Skeleton } from './ui';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[18px] bg-surface/60 p-5 ring-1 ring-inset ring-line">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="tnum mt-2.5 font-display text-[34px] leading-none text-ink">{value}</p>
      {hint ? <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

export function AccountPanel() {
  const { credits, account, ready, usable, refresh } = useAccount();
  const [history, setHistory] = useState<CreditHistoryEntry[] | null>(null);

  /**
   * Read after mount, never during render.
   *
   * `deviceSecret()` touches `localStorage`, which does not exist on the server,
   * so calling it in the render body would put a different string in the markup
   * than in the hydrated tree — a mismatch React resolves by discarding the
   * server's output for this whole subtree.
   */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  useEffect(() => setFingerprint(deviceSecret()), []);

  useEffect(() => {
    if (!hasApi || !credits.signedIn) return;
    void fetchCreditHistory()
      .then((response) => setHistory(response.history))
      .catch(() => setHistory([]));
  }, [credits.signedIn]);

  if (!usable) {
    return (
      <Notice
        tone="warn"
        title="This browser cannot be identified"
        body="Luvo keeps a random key in this browser's storage so it knows which previews are yours. Storage is blocked here — a private window, or site data turned off — so previews cannot be generated. Everything else on the site works."
      />
    );
  }

  if (!hasApi) {
    return (
      <Notice
        tone="warn"
        title="No service configured"
        body="This build has no NEXT_PUBLIC_API_URL, so there is no balance to show and nothing to sign into."
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {ready ? (
          <>
            <Stat
              label="Previews left"
              value={String(credits.total)}
              hint="Held at submit, spent when the preview lands, returned if it fails."
            />
            <Stat
              label="Free"
              value={`${credits.free} of ${credits.freeGranted}`}
              hint="Your free allowance for this browser."
            />
            <Stat
              label="Purchased"
              value={String(credits.credits)}
              hint={
                credits.signedIn
                  ? 'On your account, so they follow you between devices.'
                  : 'Buying requires an account, so purchased credits are not lost with a browser.'
              }
            />
          </>
        ) : (
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[148px] w-full rounded-[18px]" />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href="/" size="sm" variant="secondary">
          Try a haircut on
        </ButtonLink>
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          Refresh balance
        </Button>
      </div>

      <div className="my-14">
        <Rule />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The packs                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section id="packs" className="scroll-mt-24">
        <Overline>Top up</Overline>
        <h2 className="mt-3 font-display text-[clamp(1.7rem,3.6vw,2.4rem)] leading-tight tracking-[-0.015em]">
          Pay for previews, not for months.
        </h2>
        <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-muted">
          Two are on us. After that a preview costs a credit, credits come in packs, nothing
          renews, and a generation that fails is refunded automatically.
        </p>
        <div className="mt-8">
          <Pricing />
        </div>
      </section>

      <div className="my-14">
        <Rule />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Sign-in                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <Overline>Account</Overline>
        <h2 className="mt-3 font-display text-[clamp(1.7rem,3.6vw,2.4rem)] leading-tight tracking-[-0.015em]">
          {account ? (account.displayName ?? account.email ?? 'Signed in') : 'Not signed in'}
        </h2>

        {account ? (
          <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-muted">
            {account.email ? `Signed in as ${account.email}. ` : ''}
            Your purchased credits are on this account and will follow you to another browser or
            to the phone app.
          </p>
        ) : (
          <>
            <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-muted">
              You do not need an account to try Luvo — two previews are free without one. An
              account exists for exactly one reason: so credits you have{' '}
              <em className="text-ink-soft not-italic">paid for</em> are not lost when you clear
              this browser or move to another device.
            </p>

            <div className="mt-6 rounded-[18px] bg-surface/60 p-5 ring-1 ring-inset ring-line">
              <p className="text-[13.5px] font-semibold text-ink">
                {hasClerk ? 'Sign-in is being switched on' : 'Sign-in is not open yet'}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                It arrives with checkout. Until then, previews you generate are saved in this
                browser and the free allowance is tied to it.
              </p>
              <button
                type="button"
                disabled
                className="mt-4 h-10 rounded-full bg-white/6 px-5 text-[13px] font-semibold text-ink opacity-50 ring-1 ring-inset ring-line-strong"
              >
                Sign in
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* History                                                           */}
      {/* ---------------------------------------------------------------- */}
      {credits.signedIn ? (
        <section className="mt-14">
          <Overline>Ledger</Overline>
          <h2 className="mt-3 font-display text-[clamp(1.5rem,3.2vw,2rem)] leading-tight">
            Every credit, accounted for
          </h2>
          <div className="mt-6 overflow-hidden rounded-[18px] ring-1 ring-inset ring-line">
            {history === null ? (
              <Skeleton className="h-40 w-full rounded-none" />
            ) : history.length === 0 ? (
              <p className="bg-surface/60 px-5 py-7 text-center text-[13px] text-muted">
                Nothing on this account yet.
              </p>
            ) : (
              <ul>
                {history.map((entry, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-4 border-b border-line bg-surface/50 px-5 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] text-ink-soft">
                        {entry.reason ?? entry.kind}
                      </p>
                      <p className="tnum text-[11.5px] text-faint">
                        {new Date(entry.at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`tnum shrink-0 text-[14px] font-bold ${
                        entry.delta > 0 ? 'text-jade' : 'text-muted'
                      }`}
                    >
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* What is stored                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="mt-14">
        <Overline>This browser</Overline>
        <h2 className="mt-3 font-display text-[clamp(1.5rem,3.2vw,2rem)] leading-tight">
          What is kept here, and where
        </h2>
        <dl className="mt-6 grid gap-px overflow-hidden rounded-[18px] bg-line sm:grid-cols-2">
          {[
            {
              term: 'A random device key',
              detail:
                'Thirty-two random bytes in this browser, so the service knows which previews are yours. It identifies a browser, not a person, and we only ever store its hash.',
            },
            {
              term: 'Your saved looks',
              detail:
                'The finished previews, in this browser’s own database. These are the only copies in existence — ours is deleted as soon as one is downloaded.',
            },
            {
              term: 'Your answers',
              detail:
                'Gender, hair type and saved cuts, so you do not re-answer them on every visit. No photograph is ever stored here.',
            },
            {
              term: 'Nothing else',
              detail:
                'No advertising identifiers, no third-party analytics, and nothing composed from your device to recognise you across sites.',
            },
          ].map((row) => (
            <div key={row.term} className="bg-surface/60 p-5">
              <dt className="text-[13.5px] font-bold text-ink">{row.term}</dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">{row.detail}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-[12px] leading-relaxed text-faint">
          Device key on this browser:{' '}
          <code className="rounded bg-white/6 px-1.5 py-0.5 text-[11px] text-muted">
            {fingerprint ? `${fingerprint.slice(0, 8)}…` : 'unavailable'}
          </code>
          . Clearing this site&rsquo;s data removes it, your saved looks and your free allowance
          together.
        </p>
      </section>
    </>
  );
}
