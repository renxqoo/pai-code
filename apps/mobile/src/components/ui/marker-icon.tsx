import * as React from 'react';
import { StyleSheet, View } from 'react-native';

type MarkerIconProps = {
  children?: React.ReactNode;
  testID?: string | undefined;
};

/** marker 图标槽（shadcn MarkerIcon 同构）：16px 装饰位，对读屏隐藏；无图标内容时不渲染——没有图标就不占位空间。 */
export function MarkerIcon({ children, testID }: MarkerIconProps) {
  if (children === undefined || children === null) return null;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={styles.slot} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ slot: { alignItems: 'center', height: 16, justifyContent: 'center', width: 16 } });
