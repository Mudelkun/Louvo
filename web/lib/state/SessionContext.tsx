'use client';

/**
 * What the visitor has told us so far.
 *
 * Four answers, and they are deliberately the same four the app asks for:
 * gender, hair type, a photograph, and — held but not yet asked — a hair colour.
 * Everything else on the site reads from here, which is what stops the catalog
 * page and the studio disagreeing about who is browsing.
 *
 * ## The order is different from the app's, on purpose
 *
 * The app's first run asks gender and hair type *before* the photograph, because
 * those two decide which catalog exists and somebody who uploads a photo and is
 * only then asked two questions has done the work before being told why
 * (`docs/onboarding.md`).
 *
 * The web keeps that ordering inside the studio and breaks it everywhere else,
 * because a website is entered sideways. Somebody arriving on a shared link
 * lands on one haircut; somebody arriving from search lands on the catalog.
 * Neither has answered anything, and demanding they do before showing them
 * anything is how a shopfront loses them. So **nothing here is required to
 * browse**: with no gender and no type declared the catalog shows everything and
 * cards cycle through their variants, which is a fair picture of what exists.
 * The questions are asked at the point they start to matter, which is the
 * generation.
 *
 * ## What is persisted, and what is not
 *
 * The three answers are, in `localStorage`, because a visitor who comes back
 * tomorrow should not re-answer them.
 *
 * **The photograph is not, in the sense that matters.** It is never in
 * `localStorage`, never sent anywhere before there is a job to consume it, and
 * never kept beyond the visit — the promise in `docs/preview-generation.md`
 * applied to the client: the only copies of somebody's face are the one the
 * model needs for forty seconds and the finished look they chose to keep.
 *
 * What it *is* is mirrored into IndexedDB for an hour while it is the
 * photograph on screen, and that is a bug fix rather than a softening. An object
 * url is a handle the **document** holds, so it dies on a full page load — and
 * two of the site's own flows are full page loads: signing in through a provider
 * that returns as a fresh document, and paying at Stripe. Both are entered from
 * the generate button by somebody who has already chosen their picture, and both
 * used to hand them back a page with it silently gone. `pendingPhoto.ts` has the
 * bound this is kept inside; the short version is that it mirrors this state and
 * nothing else, and that a *saved look* already stores the same photograph in
 * the same database for ever.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Gender, HairTypeId } from '../contract/catalog';
import { DEFAULT_HAIR_COLOR_ID } from '../colorGrade';
import { parseHairType } from '../hairTypes';
import { clearPendingPhoto, readPendingPhoto, savePendingPhoto } from '../pendingPhoto';
import type { PreparedPhoto } from '../photo';

const STORAGE_KEY = 'luvo.session.v1';

interface Persisted {
  gender: Gender | null;
  /** `null` is "All Types", which is an answer rather than a missing one. */
  hairType: HairTypeId | null;
  /** Whether a type was actually chosen, since `null` is itself a choice. */
  hairTypeDeclared: boolean;
  colorId: string;
}

const INITIAL: Persisted = {
  gender: null,
  hairType: null,
  hairTypeDeclared: false,
  colorId: DEFAULT_HAIR_COLOR_ID,
};

export interface SessionValue extends Persisted {
  photo: PreparedPhoto | null;
  setGender: (gender: Gender | null) => void;
  setHairType: (hairType: HairTypeId | null) => void;
  setColorId: (colorId: string) => void;
  setPhoto: (photo: PreparedPhoto | null) => void;
  /** Whether a generation could be started from what we have. */
  ready: boolean;
  /** True once the persisted answers have been read — see the note below. */
  hydrated: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(INITIAL);
  const [photo, setPhotoState] = useState<PreparedPhoto | null>(null);

  /**
   * Read *after* the first paint rather than during it.
   *
   * The server has no `localStorage`, so seeding state from it would render one
   * tree on the server and a different one on the client — a hydration mismatch
   * React resolves by throwing away the server's markup. `hydrated` is exposed
   * so anything whose appearance actually depends on a stored answer can hold
   * its shape for one frame instead of flipping.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        setState((current) => ({ ...current, ...parsed }));
      }
    } catch {
      // A blocked or corrupt store is a session that starts fresh, which is the
      // same state as a first visit and needs no handling of its own.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Nothing here is worth failing a page over.
    }
  }, [state, hydrated]);

  /**
   * Replacing the photo revokes the one it replaces, and writes the new one
   * through to storage.
   *
   * An object url pins its blob in memory until it is revoked, and a visitor who
   * tries four photographs would otherwise be holding four full-size images for
   * the life of the tab.
   *
   * The write-through is what survives a full page load — see the header and
   * `pendingPhoto.ts`. It is fire-and-forget on purpose: a browser that refuses
   * the write is a browser where the sign-in trip still costs the photograph,
   * which is exactly where this started, and it is not a reason to fail the one
   * thing the visitor actually asked for.
   */
  const setPhoto = useCallback((next: PreparedPhoto | null) => {
    setPhotoState((current) => {
      if (current && current.objectUrl !== next?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return next;
    });
    // A photograph the visitor has taken off the page is one this browser stops
    // holding, immediately rather than at the hour.
    if (next) savePendingPhoto(next);
    else clearPendingPhoto();
  }, []);

  /**
   * The photograph from before the page load, adopted once.
   *
   * Two things make this safe to run against a state the visitor is also able to
   * change. It only ever fills a **hole** — the functional update refuses if
   * anything has been set in the meantime, so somebody who picks a new picture
   * while the read is in flight keeps theirs — and the url it minted is revoked
   * on that path rather than leaked, since nothing else has a handle on it.
   *
   * It is deliberately not merged into the `localStorage` effect above: that one
   * is synchronous and must finish before the first paint sets `hydrated`, and
   * this one is a database read that has no business holding that up.
   */
  useEffect(() => {
    let cancelled = false;
    void readPendingPhoto().then((stored) => {
      if (!stored) return;
      if (cancelled) {
        URL.revokeObjectURL(stored.objectUrl);
        return;
      }
      setPhotoState((current) => {
        if (current) {
          URL.revokeObjectURL(stored.objectUrl);
          return current;
        }
        return stored;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      photo,
      hydrated,
      ready: !!photo && !!state.gender,
      setGender: (gender) => setState((current) => ({ ...current, gender })),
      setHairType: (hairType) =>
        setState((current) => ({ ...current, hairType, hairTypeDeclared: true })),
      setColorId: (colorId) => setState((current) => ({ ...current, colorId })),
      setPhoto,
    }),
    [state, photo, hydrated, setPhoto],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/**
 * Answers that arrived from somewhere else, adopted once.
 *
 * Two surfaces hand the catalogue a set of answers rather than letting it read
 * the ones already stored: a style page opened from a filtered grid (`?gender=…
 * &hairType=…`), and the result page, whose look records the two answers that
 * were given *about the photograph in the picture*. In both cases what is on
 * screen was drawn with those answers, so the session has to agree with it —
 * otherwise a card renders one texture and the page it opens renders another,
 * which is the wrong-image failure the variant system exists to prevent.
 *
 * Three things make this safe to call on mount:
 *
 * - **It waits for `hydrated`.** The provider reads `localStorage` in an effect,
 *   and a child's effect runs before its parent's — so adopting before that read
 *   lands would be silently undone by it.
 * - **It runs once.** Every control on these pages writes to the same session,
 *   so re-applying would fight the visitor for the filter they just changed.
 * - **An absent answer is left alone**, never written as a null. `undefined`
 *   from `parseHairType` means the param was missing or unrecognised, which is a
 *   different thing from `all`.
 */
export function useAdoptedAnswers(answers: {
  gender?: Gender | string | null;
  hairType?: string | null;
}): void {
  const { hydrated, setGender, setHairType } = useSession();
  const { gender, hairType } = answers;
  const adopted = useRef(false);

  useEffect(() => {
    if (!hydrated || adopted.current) return;
    const nextGender = gender === 'male' || gender === 'female' ? gender : null;
    const nextType = parseHairType(hairType);
    // Nothing carried in *yet*: the result page reads its look out of IndexedDB,
    // so the answers arrive a tick after the first render. Claiming the one
    // adoption here would spend it on an empty set and leave the real one
    // unapplied.
    if (!nextGender && nextType === undefined) return;
    adopted.current = true;
    if (nextGender) setGender(nextGender);
    if (nextType !== undefined) setHairType(nextType);
  }, [hydrated, gender, hairType, setGender, setHairType]);
}
