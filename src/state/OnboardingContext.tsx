import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { claimPushPrompt, previewPushAvailability } from '@/lib/push';

const KEY = 'luvo.onboarded.v1';

/**
 * The guided first run, in order.
 *
 * It is the *same* flow the app runs forever after — the same gender screen,
 * the same hair type screen, the same catalog, the same style page — walked in
 * the order a first-time user needs rather than the order a returning one does.
 * There is deliberately no second copy of any of these screens: a parallel
 * onboarding catalog would be a second place a hairstyle can be shown, and it
 * would go stale the first time either one was touched.
 *
 * Two things differ while the run is `active`, and only two:
 *
 * - **Every screen shows where it is.** `step()` is what fills the progress bar
 *   in `<Header>`. Outside the guided run it returns undefined and no screen
 *   shows a step, which is the honest state — somebody who arrives at a style
 *   page from the Styles tab is not on step 5 of anything.
 * - **Two routes move.** Hair type leads to the photo rather than to the
 *   catalog, because in the guided run the photo has not been taken yet; and
 *   pressing Generate leads to the notification step rather than straight to
 *   the wait. Both are one branch on `active` at the point of navigation.
 *
 * The order itself is the argument: gender and hair type decide *which catalog
 * exists*, so they come before the photo — a user who uploads a face and is then
 * asked two questions has been made to do the work before being told why. The
 * home tab keeps the opposite order on purpose: it is not a questionnaire, it is
 * a screen whose one job is to take a photo.
 */
export const ONBOARDING_STEPS = ['gender', 'hairType', 'photo', 'catalog', 'style'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

type Status = 'unknown' | 'seen' | 'unseen';

interface OnboardingState {
  /** Whether the welcome screen has been shown on this device before. */
  status: Status;
  /** Whether the guided first run is in progress right now. */
  active: boolean;
  /** Where a screen sits in the run, or undefined outside it. */
  step: (name: OnboardingStep) => { current: number; total: number } | undefined;
  /**
   * Whether the notification step has anything to offer.
   *
   * Read at the moment Generate is pressed and answered from a check started
   * when the run began — by then the user has answered three questions and
   * picked a cut, so the answer has been in for a while. Unresolved counts as
   * no, which costs the step and never shows one that cannot deliver.
   */
  shouldAskPush: () => boolean;
  begin: () => void;
  complete: () => void;
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('unknown');
  const [active, setActive] = useState(false);
  // A ref rather than state: it is read once, at a button press, and nothing on
  // screen depends on it — as state it would re-render the whole flow to change
  // a number nobody is looking at.
  const askPush = useRef(false);
  const releasePrompt = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (alive) setStatus(value ? 'seen' : 'unseen');
      })
      .catch(() => {
        // A storage read that fails must not trap somebody in onboarding.
        if (alive) setStatus('seen');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Whatever happens to the run, the OS prompt goes back to whoever wants it
  // next when this provider goes away.
  useEffect(() => () => releasePrompt.current?.(), []);

  const begin = useCallback(() => {
    setActive(true);
    askPush.current = false;
    // Held for the whole run so the submit inside `GenerationContext` cannot
    // raise the bare system dialog over the screen written to explain it.
    releasePrompt.current?.();
    releasePrompt.current = claimPushPrompt();
    previewPushAvailability()
      .then((availability) => {
        askPush.current = availability === 'ask';
      })
      .catch(() => {
        askPush.current = false;
      });
  }, []);

  const complete = useCallback(() => {
    setActive(false);
    setStatus('seen');
    releasePrompt.current?.();
    releasePrompt.current = null;
    AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    setActive(false);
    setStatus('unseen');
    releasePrompt.current?.();
    releasePrompt.current = null;
    AsyncStorage.removeItem(KEY).catch(() => undefined);
  }, []);

  const step = useCallback(
    (name: OnboardingStep) =>
      active
        ? {
            current: ONBOARDING_STEPS.indexOf(name) + 1,
            total: ONBOARDING_STEPS.length,
          }
        : undefined,
    [active],
  );

  const shouldAskPush = useCallback(() => askPush.current, []);

  const value = useMemo<OnboardingState>(
    () => ({ status, active, step, shouldAskPush, begin, complete, reset }),
    [status, active, step, shouldAskPush, begin, complete, reset],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingState {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return context;
}
