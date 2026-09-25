import * as React from 'react';
import { ScrollView } from 'react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { permissionModes } from '@/strings/zh';

export function PermissionSheet() {
  const visible = useNavigationStore((state) => state.sheet === 'permission');
  const close = useNavigationStore((state) => state.closeSheet);
  const selected = useComposerStore((state) => state.permission);
  const select = useComposerStore((state) => state.selectPermission);
  return (
    <Sheet onClose={close} title="权限模式" visible={visible}>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        {permissionModes.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={selected === item.id} onPress={() => { select(item.id); close(); }} />)}
      </ScrollView>
    </Sheet>
  );
}
