import * as React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type MarkerProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
};

/** 内联会话标记行（shadcn Marker 同构）：图标槽 + 文字槽同行排列，图标槽可省略。 */
export function Marker({ children, style, testID }: MarkerProps) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 16 } });
