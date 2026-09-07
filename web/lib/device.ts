/**
 * Who is asking, from a browser.
 *
 * The API authenticates with `Authorization: Device <secret>` — 32 random bytes
 * the client mints once and keeps, of which the server stores only the SHA-256.
 * The header of `server/src/devices.ts` is the full argument; what follows is
 * only what is different about a browser.
 *
 * ## What a browser can and cannot promise
 *
 * The phone keeps its secret in the platform keystore, which on iOS is the
 * Keychain and therefore outlives the app that wrote it — that is the accident
 * of an earlier good decision that makes "a reinstall does not hand out two more
 * free generations" true on iOS without any extra machinery.
 *
 * A browser has no keystore. `localStorage` is the strongest thing available,
 * and it is cleared by clearing site data, absent in a private window, and
 * per-browser rather than per-person. So on the web the free allowance is
 * **weaker than it is on a phone**, and it is weaker in a way that is honest to
 * state rather than to paper over: somebody who wants a third free generation
 * can open a private window and have one.
 *
 * That is a deliberate trade for the moment, and the reasoning is the same one
 * the app records for install anchors: the alternative is fingerprinting — IP,
 * canvas, screen metrics — which is what the mobile design explicitly refuses,
 * which both app stores forbid, and which denies free generations to people who
 * never had any. A demand test does not need to be theft-proof; it needs to be
 * cheap to run and honest about what it measures. The real answer, when there is
 * money on the line, is an account before the free allowance rather than after,
 * which is a Clerk change and not a client one.
 *
 * **No install anchor is sent.** `X-Install-Anchor` is Android's answer to a
 * cleared keystore and there is no browser equivalent that is not
 * fingerprinting. The server treats an absent anchor as the device's own id, so
 * the allowance simply hangs off the device — see `anchorsFrom` in
 * `server/src/anchors.ts`.
 */

const STORAGE_KEY = 'luvo.device.v1';

/**
 * base64url of 32 bytes: 43 characters, no padding.
 *
 * The server validates against `/^[A-Za-z0-9_-]{32,128}$/` and rejects anything
 * else with a 401, so the encoding is part of the contract rather than a detail
 * of how it happens to be generated.
 */
function mint(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VALID = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * This browser's device secret, minting one on first use.
 *
 * Returns null on the server and in any context where storage throws — a
 * private window with site data blocked, an embedded webview with a strict
 * policy. Null is a supported state: every call that needs a device checks for
 * it and reports "generation is unavailable in this browser" rather than sending
 * a request that will 401. Inventing an in-memory secret instead would give the
 * user two free generations that vanish on reload, which is a worse lie than
 * saying so.
 */
export function deviceSecret(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && VALID.test(existing)) return existing;
    const secret = mint();
    window.localStorage.setItem(STORAGE_KEY, secret);
    return secret;
  } catch {
    return null;
  }
}

/** The `Authorization` header, or nothing when this browser has no secret. */
export function deviceHeader(): Record<string, string> {
  const secret = deviceSecret();
  return secret ? { Authorization: `Device ${secret}` } : {};
}

/** Whether this browser can identify itself to the API at all. */
export const hasDevice = (): boolean => !!deviceSecret();
