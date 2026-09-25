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

type ComposerPanelProps = { embedded?: boolean | undefined; onFocusChange?: ((focused: boolean) => void) | undefined };

export function ComposerPanel({ embedded = false, onFocusChange }: ComposerPanelProps) {
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
  const setFocus = (next: boolean) => { setFocused(next); onFocusChange?.(next); };
  return (
    <View style={embedded ? undefined : { marginBottom: spacing.xs3, marginHorizontal: spacing.xs4 }}>
      {items.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>{items.map((item) => <AttachmentChip attachment={item} key={item.id} onRemove={() => removeAttachment(item.id)} />)}</View> : null}
      {focused ? <FocusedComposer canSend={canSend} draft={draft} embedded={embedded} generating={generating} onAttachment={() => openSheet('attachments')} onBlur={() => setFocus(false)} onChangeText={setDraft} onSend={send} /> : <CompactComposer canSend={canSend} draft={draft} embedded={embedded} generating={generating} onAttachment={() => openSheet('attachments')} onChangeText={setDraft} onFocus={() => setFocus(true)} onSend={send} />}
    </View>
  );
}
