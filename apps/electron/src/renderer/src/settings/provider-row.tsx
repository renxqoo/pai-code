import * as React from 'react';
import { Boxes, Trash2, X } from 'lucide-react';

import type { ProviderConfigView } from '@paiapp/contracts';
import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { apiFormatLabel } from './api-format-options';
import { ProviderKeyBadge } from './provider-key-badge';
import { SettingsCard } from './settings-card';

type ProviderRowProps = {
  provider: ProviderConfigView
  /** 整卡点击进入渠道详情。 */
  onOpen: () => void
  onRemove: (name: string) => Promise<boolean>
};

const actionButtonClassName =
  'h-8 cursor-pointer rounded-lg px-[10px] text-[12.5px] leading-none outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** 渠道卡：名称 + key 状态、地址、API 格式与模型数摘要；整卡点击进详情，行尾两步确认删除。 */
function ProviderRow({ provider, onOpen, onRemove }: ProviderRowProps): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);

  const confirmRemove = (): void => {
    // 移除失败停留确认态，可立即重试；成功才回普通态
    void onRemove(provider.name).then((ok) => {
      if (!ok) setConfirming(true);
    });
  };

  return (
    <SettingsCard className="transition-colors hover:bg-accent/30">
      <div
        role="button"
        tabIndex={0}
        aria-label={provider.name}
        onClick={onOpen}
        onKeyDown={(event) => {
          // 只处理卡片自身聚焦时的按键：内部按钮的 Enter/Space 不得冒泡成「进入详情」
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer items-start gap-[14px] px-[16px] py-[14px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Boxes className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{provider.name}</p>
            <ProviderKeyBadge hasKey={provider.hasKey} />
          </div>
          <p className="mt-[2px] truncate text-[12px] leading-[17px] text-muted-foreground">{provider.baseUrl}</p>
          <p className="mt-[2px] truncate text-[11.5px] leading-[16px] text-muted-foreground/80">
            {copy.settings.providerMeta(apiFormatLabel(provider.api), provider.models.length)}
          </p>
          {confirming ? (
            <p className="mt-[4px] text-[11.5px] leading-[16px] text-destructive">{copy.settings.providerRemoveHint(provider.name)}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-[4px]">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  confirmRemove();
                }}
                className={`${actionButtonClassName} font-medium text-destructive hover:bg-destructive/10`}
              >
                {copy.settings.confirmRemove}
              </button>
              <IconButton
                label={copy.settings.cancelEdit}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirming(false);
                }}
              >
                <X strokeWidth={1.75} />
              </IconButton>
            </>
          ) : (
            <IconButton
              label={copy.settings.remove}
              onClick={(event) => {
                event.stopPropagation();
                setConfirming(true);
              }}
            >
              <Trash2 strokeWidth={1.75} />
            </IconButton>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

export { ProviderRow };
