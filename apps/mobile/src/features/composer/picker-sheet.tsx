import * as React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useComposerStore } from '@/store/composer-store';
import { models, permissionModes, thinkingLevels } from '@/strings/zh';

export function PickerSheet() {
  const { colors } = useAppTheme();
  const picker = useComposerStore((state) => state.picker);
  const store = useComposerStore();
  const [query, setQuery] = React.useState('');
  const title = picker === 'model' ? '选择模型' : picker === 'thinking' ? '思考强度' : picker === 'permission' ? '权限模式' : '选择';
  const close = () => { store.closePicker(); setQuery(''); };
  return (
    <Sheet onClose={close} title={title} visible={picker !== null}>
      {picker === 'model' ? <TextInput accessibilityLabel="搜索模型" onChangeText={setQuery} placeholder="搜索模型或渠道" placeholderTextColor={colors.textFaint} style={inputStyle(colors)} value={query} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs3 }}>
        {picker === 'model' ? models.filter((item) => `${item.name}${item.provider}`.toLowerCase().includes(query.toLowerCase())).map((item) => <PickerRow key={item.id} detail={item.description} label={item.name} meta={item.provider} selected={store.model === item.id} onPress={() => { store.selectModel(item.id); setQuery(''); }} />) : null}
        {picker === 'thinking' ? thinkingLevels.map((item) => <PickerRow key={item.id} detail={item.detail} label={item.label} selected={store.thinking === item.id} onPress={() => store.selectThinking(item.id)} />) : null}
        {picker === 'permission' ? permissionModes.map((item) => <PickerRow key={item.id} detail={item.detail} label={item.label} selected={store.permission === item.id} onPress={() => store.selectPermission(item.id)} />) : null}
      </ScrollView>
    </Sheet>
  );
}

function inputStyle(colors: ReturnType<typeof useAppTheme>['colors']) {
  return { backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, color: colors.text, fontSize: 14, marginBottom: spacing.sm, minHeight: 44, paddingHorizontal: 12 };
}
