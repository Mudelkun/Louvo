'use client';

/**
 * Sharing a cut.
 *
 * **A share link names a hairstyle, never an image.** What unfurls in somebody
 * else's chat is the catalogue's own mannequin render of that cut — public,
 * CDN-hosted, identical for everybody who shared it — and never a Louvo user's
 * face. That is the rule the whole feature is arranged around, it is asserted
 * server-side by `check-shares.mjs`, and it is why this button exists on a
 * *style* page and takes a style id.
 *
 * Two paths, and the difference between them is the platform's, not a
 * preference:
 *
 * - `navigator.share` where it exists, which is every phone browser and Safari.
 *   The OS sheet opens with the title and the link, which is the real thing
 *   rather than a row of buttons pretending to target apps they cannot.
 * - The clipboard everywhere else, with the button saying so. A desktop browser
 *   has no share sheet, and a fake one is the fake social-sharing button the
 *   brief rules out.
 *
 * The link is minted lazily, on the first press, rather than when the page
 * loads: a share link is a row in the database and most visitors never press
 * this. **A failed mint does not stop the share** — the caption goes out with
 * the page's own url instead, and the failure is recorded as `share_failed`.
 * That is the same rule as everywhere else here: a degraded outcome is reported,
 * never disguised.
 */

import { useCallback, useState } from 'react';

import { ApiError, createShareLink, recordEvent } from '../lib/api';
import { SITE_URL, hasApi } from '../lib/config';
import type { Gender, HairLengthId, HairTypeId } from '../lib/contract/catalog';
import { Button } from './ui';

type State = 'idle' | 'working' | 'copied' | 'failed';

export function ShareButton({
  hairstyleId,
  hairstyleName,
  gender,
  hairType,
  lengthId,
  className = '',
}: {
  hairstyleId: string;
  hairstyleName: string;
  gender?: Gender | null;
  hairType?: HairTypeId | null;
  lengthId?: HairLengthId | null;
  className?: string;
}) {
  const [state, setState] = useState<State>('idle');

  const share = useCallback(async () => {
    setState('working');
    recordEvent('share_opened', { props: { hairstyleId } });

    // The fallback is this page's own url, which always works and is always
    // right — it just cannot be counted, which is the half the feature exists
    // for. `shareSource` in the app reports the same distinction.
    let url = `${SITE_URL}/styles/${hairstyleId}`;
    let code: string | null = null;

    if (hasApi) {
      try {
        const link = await createShareLink({ hairstyleId, gender, hairType, lengthId });
        url = link.url;
        code = link.code;
      } catch (error) {
        recordEvent('share_failed', {
          props: { hairstyleId, reason: error instanceof ApiError ? error.code : 'unknown' },
        });
      }
    }

    const title = `${hairstyleName} on Louvo`;
    const text = `${hairstyleName} — try this hairstyle on Louvo.`;

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        recordEvent('share_initiated', { code, channel: 'system', props: { hairstyleId } });
        await navigator.share({ title, text, url });
        recordEvent('share_completed', { code, channel: 'system', props: { hairstyleId } });
        setState('idle');
        return;
      }

      await navigator.clipboard.writeText(url);
      recordEvent('share_initiated', { code, channel: 'unknown', props: { hairstyleId } });
      setState('copied');
      setTimeout(() => setState('idle'), 2200);
    } catch (error) {
      // `AbortError` is the user closing the sheet, which is a dismissal rather
      // than a failure and must not be reported as one — counting it would make
      // the funnel a measure of curiosity rather than of reach.
      if (error instanceof DOMException && error.name === 'AbortError') {
        recordEvent('share_dismissed', { code, props: { hairstyleId } });
        setState('idle');
        return;
      }
      recordEvent('share_failed', { code, props: { hairstyleId, reason: 'sheet' } });
      setState('failed');
      setTimeout(() => setState('idle'), 2600);
    }
  }, [hairstyleId, hairstyleName, gender, hairType, lengthId]);

  const label =
    state === 'copied' ? 'Link copied' : state === 'failed' ? 'Could not share' : 'Share';

  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={share}
      loading={state === 'working'}
      className={className}
    >
      {state === 'idle' || state === 'working' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
          <path
            d="M12 3v12M12 3 8 7M12 3l4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {label}
    </Button>
  );
}
