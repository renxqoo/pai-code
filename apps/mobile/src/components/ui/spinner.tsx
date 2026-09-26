import * as React from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Loader } from 'lucide-react-native';
import { useReducedMotion } from '@/components/ui/use-reduced-motion';

type SpinnerProps = {
  color?: string | undefined;
  size?: number | undefined;
  testID?: string | undefined;
};

/** 旋转加载指示（shadcn Spinner 同构）：loader 图标匀速自转；装饰位，对读屏隐藏。 */
export function Spinner({ color, size = 16, testID }: SpinnerProps) {
  const reducedMotion = useReducedMotion();
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (reducedMotion) return () => undefined;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.box, { height: size, transform: [{ rotate }], width: size }]}
      testID={testID}
    >
      <Loader {...(color === undefined ? {} : { color })} size={size} strokeWidth={2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
