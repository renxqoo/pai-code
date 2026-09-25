import * as React from 'react';
import { Pressable, View } from 'react-native';
import { ArrowUp, Paperclip, Square } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useComposerSubmit } from '@/features/composer/use-composer-submit';
import { CircularProgressButton } from '@/components/ui/circular-progress-button';
import { PermissionButton } from '@/components/ui/permission-button';
import { ModelButton } from '@/components/ui/model-button';

export function ComposerToolbar() {
  const { colors } = useAppTheme();
  const store = useComposerStore();
  const submit = useComposerSubmit();
  const openSheet = useNavigationStore((state) => state.openSheet);
  const canSend = store.draft.trim().length > 0;
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 36, paddingHorizontal: 4 }}>
      <Pressable accessibilityLabel="添加附件" accessibilityRole="button" onPress={() => openSheet('attachments')} style={({ pressed }) => ({ alignItems: 'center', borderRadius: radius.md, height: 34, justifyContent: 'center', opacity: pressed ? 0.55 : 1, width: 34 })}><Paperclip color={colors.textMuted} size={18} strokeWidth={1.9} /></Pressable>
      <PermissionButton mode={store.permission} onPress={() => openSheet('permission')} />
      <View style={{ flex: 1 }} />
      <CircularProgressButton accessibilityLabel={`上下文已使用 ${store.contextPercent}%`} onPress={() => openSheet('context')} value={store.contextPercent} />
      <ModelButton onPress={() => openSheet('task-settings')} />
      <Pressable
        accessibilityLabel={store.generating ? '停止生成' : '发送消息'}
        accessibilityRole="button"
        disabled={!canSend && !store.generating}
        onPress={() => store.generating ? store.toggleGeneration() : submit()}
        style={({ pressed }) => ({ alignItems: 'center', backgroundColor: store.generating ? colors.destructive : canSend ? colors.primary : colors.surfaceSubtle, borderRadius: radius.pill, flexShrink: 0, height: 34, justifyContent: 'center', marginLeft: 2, opacity: pressed ? 0.65 : 1, width: 34 })}
      >
        {store.generating ? <Square color={colors.primaryText} fill={colors.primaryText} size={13} /> : <ArrowUp color={canSend ? colors.primaryText : colors.textFaint} size={18} strokeWidth={2.4} />}
      </Pressable>
    </View>
  );
}
