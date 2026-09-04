/**
 * The share funnel, from the phone's end.
 *
 * Nine event names and one rule: **a failed analytics call may never be visible
 * to the user.** Everything here swallows its own errors, nothing here is
 * awaited by a screen, and a build with no `EXPO_PUBLIC_API_URL` records nothing
 * at all rather than queueing forever against a server that does not exist. If
 * this module stops working the app keeps sharing; that is the whole design
 * constraint and it is why there is no retry, no persistence and no vendor SDK.
 *
 * ## Why it batches
 *
 * One share is four events inside about eight seconds — opened, channel
 * selected, initiated, completed — and four requests up a phone's uplink to
 * record four rows would cost more than the feature does. So events go into a
 * small buffer and leave together on a short timer, or when the app goes to the
 * background, whichever comes first. `flush()` is exported for the one caller
 * that genuinely cannot wait: the deep-link screen, which may be recording an
 * install seconds before the user navigates away.
 *
 * ## What is not collected
 *
 * No photograph, no look, no file path, no free text the user typed. The
 * identity attached to an event is the device secret's hash, which is already
 * the only identity this backend has (`src/lib/deviceId.ts`) — it identifies a
 * phone, not a person, and a reinstall is a different phone. What each event
 * carries is a share code, a channel, a platform and a couple of small
 * enumerated facts, and the server drops anything whose name it does not
 * recognise.
 */

import { AppState, Platform } from 'react-native';

import { API_BASE_URL, hasApi } from '@/api/client';
import { deviceHeader } from '@/lib/deviceId';

/**
 * The closed set, mirrored from `SHARE_EVENTS` in `server/src/shareLinks.ts`.
 *
 * A hand-written mirror rather than a shared module, for the reason the rest of
 * this repo mirrors: the app and the server are separate programs and neither
 * may import the other. The server drops names it does not know and says how
 * many it dropped, so the two drifting apart is a number in a response rather
 * than a crash — but they are meant to agree, and `check-shares.mjs` is where
 * the server half is held to it.
 */
export type ShareEventName =
  | 'share_opened'
  | 'share_channel_selected'
  | 'share_initiated'
  | 'share_completed'
  | 'share_dismissed'
  | 'share_failed'
  | 'share_link_opened'
  | 'share_install_attributed'
  | 'share_signup_attributed';

export interface ShareEventProps {
  /** The share link this event is about, once one has been minted. */
  code?: string | null;
  /** instagram | whatsapp | facebook | system. */
  channel?: string | null;
  /** Anything small and enumerable: a reason, an OS activity id, a count. */
  props?: Record<string, unknown> | null;
}

interface QueuedEvent extends ShareEventProps {
  name: ShareEventName;
  platform: string;
}

/**
 * How long a buffered event waits for company.
 *
 * Long enough that the four events of one share leave together, short enough
 * that a user who shares and immediately kills the app loses at most this. The
 * background transition flushes too, which is what covers the common case.
 */
const FLUSH_MS = 4000;

/** A cap, so a bug upstream cannot turn this into a memory leak. */
const MAX_QUEUED = 50;

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

/**
 * Records one event.
 *
 * Fire and forget, deliberately not `async`: nothing on a screen should be able
 * to `await` this by accident, because the one thing it must never do is put a
 * share behind a network call to an analytics endpoint.
 */
export function track(name: ShareEventName, options: ShareEventProps = {}): void {
  if (__DEV__) console.log(`[share] ${name}`, options.channel ?? '', options.code ?? '');
  if (!hasApi()) return;

  if (queue.length >= MAX_QUEUED) queue.shift();
  queue.push({ name, platform: Platform.OS, ...options });

  // Flushed on the way to the background as well as on the timer, because that
  // transition is exactly what a share *is*: the user has just left for
  // Instagram, and the events describing why are still sitting in this buffer.
  if (!listening) {
    listening = true;
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
  }

  timer ??= setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

/**
 * Sends whatever is buffered.
 *
 * Never rejects. The queue is emptied *before* the request rather than after:
 * an event that could not be delivered is gone, which is the right trade for a
 * funnel — a retry that outlives the session it describes would put yesterday's
 * timestamps in today's batch, and a number that is quietly wrong is worse than
 * a number that is quietly missing.
 */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || !hasApi()) return;

  const events = queue;
  queue = [];

  try {
    await fetch(`${API_BASE_URL}/v1/events`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await deviceHeader()),
      },
      body: JSON.stringify({ events }),
    });
  } catch (error) {
    if (__DEV__) console.warn(`[share] events not recorded: ${(error as Error).message}`);
  }
}
