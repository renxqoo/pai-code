import * as React from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { BrainCircuit, Gauge, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { models, permissionModes, thinkingLevels } from '@/strings/zh';

export function TaskConfigSheet() {
  const { colors } = useAppTheme();
  const visible = useNavigationStore((state) => state.sheet === 'task-config');
  const close = useNavigationStore((state) => state.closeSheet);
  const store = useComposerStore();
  const [query, setQuery] = React.useState('');
  const filteredModels = models.filter((item) => `${item.name}${item.provider}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Sheet onClose={close} title="任务配置" visible={visible}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs5 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs }}><Sparkles color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>模型</Text></View>
        <TextInput accessibilityLabel="搜索模型" onChangeText={setQuery} placeholder="搜索模型或渠道" placeholderTextColor={colors.textFaint} style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, color: colors.text, fontSize: 14, marginBottom: spacing.xs, minHeight: 44, paddingHorizontal: 14 }} value={query} />
        {filteredModels.map((item) => <PickerRow detail={item.description} key={item.id} label={item.name} meta={item.provider} selected={store.model === item.id} onPress={() => store.selectModel(item.id)} />)}
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs3 }}><BrainCircuit color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>思考强度</Text></View>
        {thinkingLevels.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={store.thinking === item.id} onPress={() => store.selectThinking(item.id)} />)}
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs3 }}><ShieldCheck color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>权限模式</Text></View>
        {permissionModes.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={store.permission === item.id} onPress={() => store.selectPermission(item.id)} />)}
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs3 }}><Gauge color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>上下文 · {store.contextPercent}%</Text></View>
        <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 10, overflow: 'hidden' }}><View style={{ backgroundColor: store.contextPercent >= 90 ? colors.destructive : colors.text, borderRadius: radius.pill, height: 10, width: `${store.contextPercent}%` }} /></View>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.sm }}>配置应用于当前对话；默认配置可在个人设置中调整。</Text>
      </ScrollView>
    </Sheet>
  );
}
