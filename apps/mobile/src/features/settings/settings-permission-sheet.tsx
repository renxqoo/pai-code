import * as React from 'react';
import { ScrollView } from 'react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useNavigationStore } from '@/store/navigation-store';
import { useSettingsStore } from '@/store/settings-store';
import { permissionModes } from '@/strings/zh';

export function SettingsPermissionSheet() {
  const visible = useNavigationStore((state) => state.sheet === 'settings-permission');
  const close = useNavigationStore((state) => state.closeSheet);
  const selected = useSettingsStore((state) => state.defaultPermission);
  const setPermission = useSettingsStore((state) => state.setDefaultPermission);
  return <Sheet onClose={close} title="默认权限模式" visible={visible}><ScrollView contentContainerStyle={{ paddingBottom: 12 }}>{permissionModes.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={selected === item.id} onPress={() => { setPermission(item.id); close(); }} />)}</ScrollView></Sheet>;
}
