import * as React from 'react';
import { View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { AttachmentChip } from '@/features/composer/attachment-chip';
import { CompactComposer } from '@/features/composer/compact-composer';
import { FocusedComposer } from '@/features/composer/focused-composer';
import { useComposerSubmit } from '@/features/composer/use-composer-submit';

export function ComposerPanel() {
  const [focused, setFocused] = React.useState(false);
  const draft = useComposerStore((state) => state.draft);
  const generating = useComposerStore((state) => state.generating);
  const setDraft = useComposerStore((state) => state.setDraft);
  const toggleGeneration = useComposerStore((state) => state.toggleGeneration);
  const items = useAttachmentStore((state) => state.items);
  const removeAttachment = useAttachmentStore((state) => state.removeAttachment);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const submit = useComposerSubmit();
  const canSend = draft.trim().length > 0;
  const send = () => generating ? toggleGeneration() : submit();
  return (
    <View style={{ marginBottom: spacing.xs3, marginHorizontal: spacing.xs4 }}>
      {items.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>{items.map((item) => <AttachmentChip attachment={item} key={item.id} onRemove={() => removeAttachment(item.id)} />)}</View> : null}
      {focused ? <FocusedComposer canSend={canSend} draft={draft} generating={generating} onAttachment={() => openSheet('attachments')} onBlur={() => setFocused(false)} onChangeText={setDraft} onSend={send} /> : <CompactComposer canSend={canSend} draft={draft} generating={generating} onAttachment={() => openSheet('attachments')} onChangeText={setDraft} onFocus={() => setFocused(true)} onSend={send} />}
    </View>
  );
}
