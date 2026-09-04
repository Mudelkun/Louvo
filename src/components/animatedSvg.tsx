import React from 'react';
import { Animated, Platform } from 'react-native';

/**
 * `Animated.createAnimatedComponent` for a react-native-svg shape.
 *
 * Animated forces `collapsable={false}` onto whatever it wraps, so the native
 * view survives Android's view flattening and there is still something to push
 * animated props at. react-native-svg's web shapes spread every prop they do
 * not recognise straight onto the DOM node, so on web that arrives as
 * `<circle collapsable="false">` and React logs "Received `false` for a
 * non-boolean attribute `collapsable`" — once per app load, from whichever
 * animated shape rendered first.
 *
 * So the prop is swallowed on web and left alone everywhere else: the flag is
 * meaningless to a DOM element and load-bearing to a native one. The ref still
 * lands on the shape itself, which is what Animated drives.
 */
export function createAnimatedSvg<C extends React.ComponentClass<any>>(
  Component: C,
): Animated.AnimatedComponent<C> {
  if (Platform.OS !== 'web') return Animated.createAnimatedComponent(Component);

  const WebShape = React.forwardRef<InstanceType<C>, React.ComponentProps<C> & { collapsable?: boolean }>(
    function WebShape({ collapsable, ...props }, ref) {
      return React.createElement(Component, { ...props, ref });
    },
  );
  WebShape.displayName = `AnimatedSvg(${Component.displayName ?? Component.name ?? 'Shape'})`;

  return Animated.createAnimatedComponent(WebShape as unknown as C);
}
