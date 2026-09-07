import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, ViewProps } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NATIVE_DRIVER } from '@/lib/motion';

/** How far the content travels on its way in. Small on purpose — see below. */
const RISE = 12;
const DURATION = 300;
/** One beat between blocks. Long enough to read as an order, short enough that
 *  the last block is in before a fast reader has finished the first line. */
export const REVEAL_STEP = 55;

/**
 * Everything a `<View>` takes, so this can *replace* the view it animates rather
 * than wrap one — an accessibility role or a test id on the container stays on
 * the container, and no screen gains a level of nesting for an animation.
 */
interface RevealProps extends ViewProps {
  children: React.ReactNode;
  /** Position in the stagger, in `REVEAL_STEP` beats. */
  index?: number;
}

/**
 * The entrance for a question the flow is asking.
 *
 * Every screen in the guided run is a title, a line of explanation and a set of
 * answers, and arriving with all three at once reads as a page that was already
 * there — the user's eye has to find the beginning. Bringing them in one beat
 * apart puts the reading order on screen without saying anything, which is the
 * whole of what this is for.
 *
 * Twelve points and 300ms, deliberately. This is the app introducing itself, so
 * it runs once per screen and is over before anybody could describe it; a longer
 * or larger version is the same idea turned into something to sit through, and
 * it would be sat through on every one of five screens.
 *
 * Under reduce-motion it is the finished frame and nothing else. That is the
 * same rule the variant cycle and the skeleton pulse follow: nobody started this
 * animation, so the setting is entitled to have it not happen at all.
 */
export function Reveal({ children, index = 0, style, ...rest }: RevealProps) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay: index * REVEAL_STEP,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduced]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [RISE, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
