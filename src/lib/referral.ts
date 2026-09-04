/**
 * Where this install came from, if anywhere.
 *
 * The receiving half of the share loop. Somebody follows a friend's link, the OS
 * hands the app `hairify://s/<code>`, and this is the module that decides
 * whether that counts as a new user arriving and tells the backend once.
 *
 * ## What is honestly measurable, and what is not
 *
 * This is the part of the brief where the temptation to overclaim is strongest,
 * so it is worth being exact about the three cases:
 *
 * - **The app is installed and the link is followed.** Fully attributable. The
 *   OS routes the url into the app, the code arrives, and the device reports it.
 *   This is what `deep_link` means and it is the only source anything here
 *   writes.
 * - **Android, installed from the Play listing the landing page sent them to.**
 *   Attributable in principle: `androidUrlFor()` on the server puts the code in
 *   the Play `referrer` parameter, Google preserves it through the install, and
 *   the Install Referrer API hands it to the app on first run. Reading it needs
 *   a native module this project does not have, so **nothing reports it today**
 *   — the `referrer` source exists on the server for the day one is added.
 * - **iOS, installed from the App Store.** Not attributable without a
 *   third-party attribution SDK, full stop. There is no deferred deep link on
 *   iOS that does not involve one, and no amount of code here changes that. The
 *   funnel therefore counts iOS installs only when the person later opens
 *   another share link, and that gap is a known one rather than a bug.
 *
 * ## First link wins, and it wins here as well as on the server
 *
 * The device remembers the first code it ever arrived on and stops reporting
 * after that. The server enforces the same rule independently
 * (`share_attributions` is `insert ... where not exists`), so this is not the
 * mechanism — it is what keeps a user who opens six links from making six
 * requests to be told no five times.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportAttribution } from '@/api/share';
import { track } from '@/lib/analytics';

const KEY = 'hairify.referral.v1';

interface StoredReferral {
  code: string;
  /** When this device first arrived on it. */
  at: number;
  /** Whether the backend accepted it as this device's first. */
  attributed: boolean;
}

let cached: StoredReferral | null | undefined;

async function read(): Promise<StoredReferral | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as StoredReferral) : null;
  } catch {
    cached = null;
  }
  return cached;
}

async function write(value: StoredReferral): Promise<void> {
  cached = value;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // A referral we cannot write down is a referral reported once and then
    // forgotten, which the server's own first-write-wins makes harmless.
  }
}

/** The share that brought this device in, if one did. */
export async function referralCode(): Promise<string | null> {
  return (await read())?.code ?? null;
}

/**
 * Records that a share link was followed, and attributes the device if this is
 * the first one it has ever seen.
 *
 * Two events rather than one, because they are two different facts.
 * `share_link_opened` fires every time — it is the sharer's number, and a link
 * opened three times by three people is worth three of it.
 * `share_install_attributed` fires only when the backend says this device had
 * never been attributed before, which is the only version of "a new user came
 * from a share" this app can honestly assert.
 *
 * Never throws and is never awaited by anything the user is waiting on.
 */
export async function rememberReferral(code: string): Promise<void> {
  track('share_link_opened', { code, props: { source: 'deep_link' } });

  const existing = await read();
  // A device that already has a referral does not get a second one, and does not
  // spend a request finding that out. The server would refuse it anyway.
  if (existing) return;

  const attribution = await reportAttribution(code, 'deep_link');
  await write({ code, at: Date.now(), attributed: !!attribution?.first });

  if (attribution?.first) track('share_install_attributed', { code });
}

/**
 * The device became an account.
 *
 * **Nothing calls this**, because there are no accounts — see the profile card
 * in Settings. It is here rather than absent because the whole point of the
 * funnel is to end at a signup, and the alternative to a one-line seam is a
 * schema change, a route and a client call all landing on the day accounts do.
 * Call it once, immediately after the first successful signup on a device.
 */
export async function reportSignupFromReferral(): Promise<void> {
  const referral = await read();
  if (!referral) return;
  track('share_signup_attributed', { code: referral.code });
}
