import * as React from 'react';

import { copy } from '@/strings';
import type { ProviderConfigView } from '@paiapp/contracts';

type ProviderRowProps = {
  provider: ProviderConfigView;
  onRemove: (name: string) => Promise<boolean>;
};

/** 已配置 provider 行：名称/地址/模型与 key 状态；移除需二次确认。 */
function ProviderRow({ provider, onRemove }: ProviderRowProps) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className="mb-[8px] flex items-start justify-between gap-[10px] rounded-[10px] border border-border px-[12px] py-[10px]">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium">{provider.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{provider.baseUrl}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {provider.models.join(', ')} · {provider.hasKey ? copy.settings.keyPresent : copy.settings.keyMissing}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-[6px] pt-[2px]">
          <button type="button" onClick={() => void onRemove(provider.name)} className="text-[11.5px] text-red-600 hover:underline">
            {copy.settings.confirmRemove}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-[11.5px] text-muted-foreground hover:underline">
            {copy.dialogs.cancel}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="shrink-0 pt-[2px] text-[11.5px] text-muted-foreground hover:text-foreground">
          {copy.settings.remove}
        </button>
      )}
    </div>
  );
}

export { ProviderRow };
