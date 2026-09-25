import * as React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { BrainCircuit, Sparkles } from 'lucide-react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { SettingSection } from '@/components/composer/setting-section';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { models, thinkingLevels } from '@/strings/zh';

export function TaskSettingsSheet() {
  const { colors } = useAppTheme();
  const visible = useNavigationStore((state) => state.sheet === 'task-settings');
  const close = useNavigationStore((state) => state.closeSheet);
  const store = useComposerStore();
  const [query, setQuery] = React.useState('');
  const filteredModels = models.filter((item) => `${item.name}${item.provider}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Sheet onClose={close} title="模型与思考" visible={visible}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs4 }} showsVerticalScrollIndicator={false}>
        <SettingSection icon={Sparkles} title="模型" />
        <TextInput accessibilityLabel="搜索模型" onChangeText={setQuery} placeholder="搜索模型或渠道" placeholderTextColor={colors.textFaint} style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, color: colors.text, fontSize: 14, marginBottom: spacing.xs, minHeight: 44, paddingHorizontal: 12 }} value={query} />
        {filteredModels.map((item) => <PickerRow detail={item.description} key={item.id} label={item.name} meta={item.provider} selected={store.model === item.id} onPress={() => store.selectModel(item.id)} />)}
        <SettingSection icon={BrainCircuit} title="思考强度" />
        {thinkingLevels.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={store.thinking === item.id} onPress={() => store.selectThinking(item.id)} />)}

      </ScrollView>
    </Sheet>
  );
}

