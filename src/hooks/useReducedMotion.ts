import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the platform has been asked to keep motion down.
 *
 * Two animations in the app are of the kind the setting exists for: nobody
 * starts them and nothing stops them — the variant cycle running on every card
 * in the grid, and the skeleton pulse running on every placeholder while the
 * catalog loads. Both resolve to their resting frame under this rather than to a
 * degraded version of themselves.
 *
 * It lives here rather than in either of them because a second copy would be a
 * second subscription to the same platform event for the same answer.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
