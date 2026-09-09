import * as React from 'react';

import { copy } from '@/strings';

type ProviderKeyBadgeProps = {
  hasKey: boolean
};

/** key 状态 pill：绿点=已保存 / 红点=缺少（状态色是页面上仅有的彩色语义）。 */
function ProviderKeyBadge({ hasKey }: ProviderKeyBadgeProps): React.JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
      <span aria-hidden="true" className={`size-[6px] shrink-0 rounded-full ${hasKey ? 'bg-dot-done' : 'bg-stop'}`} />
      {hasKey ? copy.settings.keyPresent : copy.settings.keyMissing}
    </span>
  );
}

export { ProviderKeyBadge };
