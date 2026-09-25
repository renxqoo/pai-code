import * as React from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type ComposerAttachmentButtonProps = { onPress: () => void };

export function ComposerAttachmentButton({ onPress }: ComposerAttachmentButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel="添加附件"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 44, justifyContent: 'center', opacity: pressed ? 0.55 : 1, width: 44 })}
    >
      <Plus color={colors.textMuted} size={20} strokeWidth={1.9} />
    </Pressable>
  );
}
