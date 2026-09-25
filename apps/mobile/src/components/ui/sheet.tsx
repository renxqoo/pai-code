import * as React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { IconButton } from '@/components/ui/icon-button';

type SheetProps = { visible: boolean; title: string; onClose: () => void; children: React.ReactNode };

export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="关闭面板" onPress={onClose} style={{ flex: 1 }} />
        <View style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '78%', paddingBottom: Math.max(insets.bottom, spacing.xs3), paddingHorizontal: spacing.xs3 }}>
          <View style={{ alignItems: 'center', alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: spacing.xs2, width: 38 }} />
          <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 48 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, flex: 1, fontSize: 18, fontWeight: '700' }}>{title}</Text>
            <IconButton icon={X} label="关闭" onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
