/**
 * Telling a phone its preview is ready.
 *
 * This is the payoff for moving generation off the device: the app can be closed,
 * the screen can be off, and a notification still arrives. It is also the only
 * thing in the preview pipeline that reaches *out* to a user rather than
 * answering them, so it is deliberately small and deliberately best-effort — a
 * push that fails is a preview the user finds on their next open, not a job that
 * failed.
 *
 * Expo's push service rather than APNs and FCM directly. One HTTPS call covers
 * both platforms, tokens are opaque strings we do not have to key by platform,
 * and the credentials stay in the EAS project instead of in this deployment. The
 * cost is a hop we do not run; the alternative is two protocols, two credential
 * rotations and a certificate that expires on a Sunday.
 */

import { env } from './env.js';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Deep-link payload — the app opens straight onto the finished preview. */
  data: Record<string, string>;
}

interface Ticket {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends a batch and reports the tokens that are permanently dead.
 *
 * `DeviceNotRegistered` is the one error worth acting on: the app was
 * uninstalled or the token was rotated, and every future send to it will fail
 * the same way. The caller nulls those rows. Everything else — a rate limit, a
 * bad gateway — is transient and dropped, because a retry queue for
 * notifications about work that is already finished and already visible in the
 * app is machinery earning nothing.
 */
export async function sendPush(messages: PushMessage[]): Promise<{ dead: string[] }> {
  if (!messages.length) return { dead: [] };

  const dead: string[] = [];
  // Expo's documented ceiling is 100 messages per request.
  for (let index = 0; index < messages.length; index += 100) {
    const batch = messages.slice(index, index + 100);
    let tickets: Ticket[] = [];
    try {
      const response = await fetch(env.previews.expoPushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(
          batch.map((message) => ({
            to: message.token,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: 'default',
            // The preview is waiting to be collected and the app shows it the
            // moment it opens; a notification older than that is noise.
            ttl: 60 * 60 * 24,
            priority: 'high',
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as { data?: Ticket[] };
      tickets = payload.data ?? [];
    } catch {
      continue;
    }

    tickets.forEach((ticket, position) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        const message = batch[position];
        if (message) dead.push(message.token);
      }
    });
  }

  return { dead };
}

/**
 * The words on the lock screen.
 *
 * Named rather than generic, because "your preview is ready" is what every app
 * says and the user asked for a specific haircut. It is the same instinct as
 * `STAGE_WORDS` on the waiting screen: say the thing they asked for, not the
 * thing the software did.
 */
export const readyMessage = (hairstyleName: string): { title: string; body: string } => ({
  title: 'Your new look is ready',
  body: `See yourself with a ${hairstyleName}.`,
});
