import * as React from 'react';
import { TextInput, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { AttachmentChip } from '@/features/composer/attachment-chip';
import { ComposerToolbar } from '@/features/composer/composer-toolbar';

export function ComposerPanel() {
  const { colors } = useAppTheme();
  const draft = useComposerStore((state) => state.draft);
  const setDraft = useComposerStore((state) => state.setDraft);
  const items = useAttachmentStore((state) => state.items);
  const removeAttachment = useAttachmentStore((state) => state.removeAttachment);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, marginHorizontal: spacing.xs4, paddingBottom: 3, shadowColor: '#3F3F46', shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.09, shadowRadius: 18, elevation: 4, marginBottom: spacing.xs3, minHeight: 88 }}>
      {items.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>{items.map((item) => <AttachmentChip attachment={item} key={item.id} onRemove={() => removeAttachment(item.id)} />)}</View> : null}
      <TextInput
        accessibilityLabel="消息输入框"
        multiline
        onChangeText={setDraft}
        placeholder="描述任务，或粘贴代码和错误信息…"
        placeholderTextColor={colors.textFaint}
        style={{ color: colors.text, flex: 1, fontSize: 16, lineHeight: 23, maxHeight: 112, minHeight: 46, paddingHorizontal: 16, paddingTop: 13 }}
        value={draft}
      />
      <ComposerToolbar />
    </View>
  );
}
