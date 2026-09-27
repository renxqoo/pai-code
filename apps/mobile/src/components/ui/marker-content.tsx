import * as React from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { type } from '@/theme/tokens';
import { useReducedMotion } from '@/components/ui/use-reduced-motion';

type MarkerContentProps = {
  children: string;
  /** 进行中：文字流光（shadcn shimmer 的 RN 同构效果） */
  shimmer?: boolean | undefined;
  numberOfLines?: number | undefined;
  /**
   * 标签不参与压缩（默认）：marker 的标签（「思考」「已编辑」）是这一行的身份，
   * 后面跟的是可省略的预览文本——让预览压缩、标签折行，窄屏上「思考」会被挤成
   * 两行竖排（bw 实拍）。要给可压缩的正文用，调用方显式传 false。
   */
  shrink?: boolean | undefined;
  style?: StyleProp<TextStyle> | undefined;
  testID?: string | undefined;
};

/** marker 文字槽（shadcn MarkerContent 同构）：弱化文字 + 可选流光；动画循环随卸载停止。 */
export function MarkerContent({ children, shimmer = false, numberOfLines, shrink = false, style, testID }: MarkerContentProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const glow = React.useRef(new Animated.Value(1)).current;
  const animated = shimmer && !reducedMotion;
  React.useEffect(() => {
    if (!animated) {
      glow.setValue(1);
      return () => undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, glow]);
  return (
    <Animated.Text
      numberOfLines={numberOfLines}
      style={[styles.text, { color: colors.textMuted, flexShrink: shrink ? 1 : 0 }, style, animated ? { opacity: glow } : undefined]}
      testID={testID}
    >
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({ text: { fontSize: type.row.fontSize } });
