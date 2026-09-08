/**
 * The one place that sends an email.
 *
 * Plain `fetch` against Resend rather than the SDK, for the reason `account.ts`
 * gave when this was a private function inside it: it is one POST, and a
 * dependency whose only job is to build one JSON body is a dependency to keep
 * updated for nothing. It moved out here when the abuse alert became a second
 * caller — two copies of a mail call are two places to get the `from` address
 * wrong, and only one of them would be noticed.
 *
 * It returns false rather than throwing. A mail provider being down is a 502 to
 * a user waiting on a sign-in code, and for an abuse alert it is a log line and
 * nothing else: an alert that cannot be delivered must never be allowed to fail
 * the request that raised it, because the request that raised it is somebody
 * trying to use the product.
 */

import { env } from './env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Whether this deployment can send mail at all. */
export const canSendMail = (): boolean => !!env.auth.resendApiKey;

export async function sendMail({ to, subject, text }: Mail): Promise<boolean> {
  if (!env.auth.resendApiKey) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.auth.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.auth.emailFrom, to: [to], subject, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
