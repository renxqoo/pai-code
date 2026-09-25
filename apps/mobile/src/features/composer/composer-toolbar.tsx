import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Plus, Square, ArrowUp } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { models, permissionModes, thinkingLevels } from '@/strings/zh';
import { ToolbarButton } from '@/features/composer/toolbar-button';
import { useComposerSubmit } from '@/features/composer/use-composer-submit';

export function ComposerToolbar() {
  const { colors } = useAppTheme();
  const store = useComposerStore();
  const submit = useComposerSubmit();
  const openSheet = useNavigationStore((state) => state.openSheet);
  const model = models.find((item) => item.id === store.model);
  const permission = permissionModes.find((item) => item.id === store.permission);
  const thinking = thinkingLevels.find((item) => item.id === store.thinking);
  const canSend = store.draft.trim().length > 0;
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', paddingHorizontal: spacing.sm, paddingTop: 6 }}>
      <ToolbarButton icon={Plus} label="添加附件" onPress={() => openSheet('attachments')} />
      <ToolbarButton label={permission?.label ?? '权限'} onPress={() => store.openPicker('permission')} text />
      <View style={{ flex: 1 }} />
      <Text style={{ color: colors.textFaint, fontSize: 10, marginRight: spacing.sm }}>上下文 {store.contextPercent}%</Text>
      <ToolbarButton label={thinking?.label ?? '思考'} onPress={() => store.openPicker('thinking')} text />
      <ToolbarButton label={model?.name ?? '模型'} onPress={() => store.openPicker('model')} text />
      <Pressable
        accessibilityLabel={store.generating ? '停止生成' : '发送消息'}
        accessibilityRole="button"
        disabled={!canSend && !store.generating}
        onPress={() => store.generating ? store.toggleGeneration() : submit()}
        style={({ pressed }) => ({ alignItems: 'center', backgroundColor: store.generating ? colors.destructive : canSend ? colors.primary : colors.surfaceSubtle, borderRadius: radius.pill, height: 38, justifyContent: 'center', marginLeft: spacing.sm, opacity: pressed ? 0.65 : 1, width: 38 })}
      >
        {store.generating ? <Square color={colors.primaryText} fill={colors.primaryText} size={13} /> : <ArrowUp color={canSend ? colors.primaryText : colors.textFaint} size={19} strokeWidth={2.4} />}
      </Pressable>
    </View>
  );
}
