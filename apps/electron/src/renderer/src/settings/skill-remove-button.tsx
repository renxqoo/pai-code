/** 技能行删除（两步内联确认范式：先点删除，再确认/取消——provider-row 同款）；
 *  自 skills-section 拆出（一组件一文件纪律）。 */
import * as React from 'react';
import { Trash2 } from 'lucide-react';

import { ActionButton, IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

export function SkillRemoveButton({ name, onRemove }: { name: string; onRemove: (name: string) => Promise<boolean> }): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <span className="flex items-center gap-[6px]">
        <span className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.skillDeleteConfirm(name)}</span>
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
    <IconButton label={copy.settings.skillDeleteLabel(name)} onClick={() => setConfirming(true)}>
      <Trash2 strokeWidth={1.75} />
    </IconButton>
  );
}
