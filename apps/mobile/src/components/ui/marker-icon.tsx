import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

type MarkerIconProps = {
  /** 进行中：spinner 顶替静态图标 */
  loading?: boolean | undefined;
  color?: string | undefined;
  children?: React.ReactNode;
  testID?: string | undefined;
};

/** marker 图标槽（shadcn MarkerIcon 同构）：16px 装饰位，对读屏隐藏；图标可省略，loading 时由 spinner 顶替。 */
export function MarkerIcon({ loading = false, color, children, testID }: MarkerIconProps) {
  if (loading) return <Spinner color={color} testID={testID} />;
  if (children === undefined || children === null) return null;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={styles.slot} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ slot: { alignItems: 'center', height: 16, justifyContent: 'center', width: 16 } });
