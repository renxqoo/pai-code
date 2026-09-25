import * as React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { ContentRow } from '@/components/ui/content-row';
import type { ContentItem } from '@/components/ui/content-item';

type ContentCardProps = { items: readonly ContentItem[]; padded?: boolean };

export function ContentCard({ items, padded = false }: ContentCardProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden', padding: padded ? spacing.xs4 : 0, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 3 }}>
      {items.map((item, index) => <React.Fragment key={`${item.label}-${index}`}><ContentRow {...item} />{index < items.length - 1 ? <View style={{ backgroundColor: colors.divider, height: 1, marginLeft: item.icon === undefined ? 0 : 64 }} /> : null}</React.Fragment>)}
    </View>
  );
}
