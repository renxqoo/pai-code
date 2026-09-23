/** 插件行移除（两步内联确认范式：先点移除，再确认/取消——skill-remove-button 同款）；
 *  仅 vendor 件出现（builtin 件分区内不渲染移除钮）。 */
import * as React from 'react';
import { Trash2 } from 'lucide-react';

import { ActionButton, IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

export function PluginRemoveButton({ name, onRemove }: { name: string; onRemove: (name: string) => Promise<boolean> }): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <span className="flex items-center gap-[6px]">
        <span className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginDeleteConfirm(name)}</span>
        <ActionButton size="sm" variant="outline" onClick={() => { setConfirming(false); void onRemove(name); }}>
          {copy.settings.confirmRemove}
        </ActionButton>
        <ActionButton size="sm" variant="quiet" onClick={() => setConfirming(false)}>
          {copy.settings.cancelEdit}
        </ActionButton>
      </span>
    );
  }
  return (
    <IconButton label={copy.settings.pluginDeleteLabel(name)} onClick={() => setConfirming(true)}>
      <Trash2 strokeWidth={1.75} />
    </IconButton>
  );
}
