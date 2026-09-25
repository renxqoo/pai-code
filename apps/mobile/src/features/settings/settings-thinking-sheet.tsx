import * as React from 'react';
import { ScrollView } from 'react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useNavigationStore } from '@/store/navigation-store';
import { useSettingsStore } from '@/store/settings-store';
import { thinkingLevels } from '@/strings/zh';

export function SettingsThinkingSheet() {
  const visible = useNavigationStore((state) => state.sheet === 'settings-thinking');
  const close = useNavigationStore((state) => state.closeSheet);
  const selected = useSettingsStore((state) => state.defaultThinking);
  const setThinking = useSettingsStore((state) => state.setDefaultThinking);
  return <Sheet onClose={close} title="默认思考强度" visible={visible}><ScrollView contentContainerStyle={{ paddingBottom: 12 }}>{thinkingLevels.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={selected === item.id} onPress={() => { setThinking(item.id); close(); }} />)}</ScrollView></Sheet>;
}
