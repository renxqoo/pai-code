import * as React from 'react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

import { FieldLabel } from './field-label';
import { ProviderKeyBadge } from './provider-key-badge';

type ProviderKeyFieldProps = {
  value: string
  onChange: (value: string) => void
  /** 已存 key 时展示状态 pill 与清除入口（key 永不回显）。 */
  hasKey: boolean
  /** 清除已存 key（独立于表单保存：用磁盘现值 upsert apiKey:''）。 */
  onClear: () => Promise<boolean>
};

/**
 * 渠道密钥字段：密码输入 + key 状态 pill + 两步确认清除。
 * 清除是即时生效的独立动作（不经表单提交），成功后输入框一并清空，避免残留草稿覆盖清除结果。
 */
function ProviderKeyField({ value, onChange, hasKey, onClear }: ProviderKeyFieldProps): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [clearFailed, setClearFailed] = React.useState(false);

  const confirmClear = async (): Promise<void> => {
    setClearing(true);
    const ok = await onClear();
    setClearing(false);
    if (!ok) {
      setClearFailed(true);
      return;
    }
    setClearFailed(false);
    setConfirming(false);
    onChange('');
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <FieldLabel label={copy.settings.providerFieldKey} htmlFor="provider-key" />
      <div className="flex items-center gap-[8px]">
        <input
          id="provider-key"
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hasKey ? copy.settings.providerKeyKeepHint : copy.settings.providerFieldKey}
          autoComplete="off"
          className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13px] leading-[18px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
        />
        <ProviderKeyBadge hasKey={hasKey} />
      </div>
      <div className="flex items-center gap-[8px]">
        <p className={cn('mr-auto text-[11px] leading-[15px]', clearFailed ? 'text-destructive' : 'text-muted-foreground')}>
          {clearFailed ? copy.settings.providerKeyClearFailed : copy.settings.providerFieldKeyHint}
        </p>
        {hasKey ? (
          confirming ? (
            <>
              <button
                type="button"
                onClick={() => void confirmClear()}
                disabled={clearing}
                className="cursor-pointer rounded-md px-[6px] py-[3px] text-[11.5px] leading-none text-destructive outline-none select-none hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
              >
                {copy.settings.providerKeyClearConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={clearing}
                className="cursor-pointer rounded-md px-[6px] py-[3px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
              >
                {copy.settings.cancelEdit}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setClearFailed(false);
                setConfirming(true);
              }}
              className="cursor-pointer rounded-md px-[6px] py-[3px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {copy.settings.providerKeyClear}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

export { ProviderKeyField };
