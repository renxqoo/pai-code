import * as React from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';

import type { CredentialView } from '@paiapp/contracts';
import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';

type KeysSectionProps = {
  credentials: readonly CredentialView[]
  onSave: (provider: string, apiKey: string) => Promise<boolean>
  onRemove: (provider: string) => Promise<boolean>
  onRefresh: () => void
}

const fieldClassName = 'h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30';

/** API keys 分区：已存凭据卡列表（类型可见、key 不回显，移除需确认）+ 新增表单 + 说明文字。 */
function KeysSection({ credentials, onSave, onRemove, onRefresh }: KeysSectionProps) {
  const [provider, setProvider] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (saving) return;
    setError(null);
    const nextProvider = provider.trim();
    const nextKey = apiKey.trim();
    if (nextProvider.length === 0 || nextKey.length === 0) {
      setError(copy.settings.keysFormIncomplete);
      return;
    }
    setSaving(true);
    const ok = await onSave(nextProvider, nextKey);
    setSaving(false);
    if (!ok) {
      // 失败原因（hub 拒绝等）走全局通知条；此处内联兜底，避免设置页全屏下动作无反馈
      setError(copy.settings.formFailed);
      return;
    }
    setProvider('');
    setApiKey('');
  };

  return (
    <section>
      <SettingsPageHeader
        title={copy.settings.keysTitle}
        description={copy.settings.keysDesc}
      />
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-start justify-between gap-[16px]">
          <p className="max-w-[560px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.keysHint}</p>
          <IconButton label={copy.settings.refresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        {credentials.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.keysEmpty}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {credentials.map((credential) => (
              <SettingsCard key={`${credential.provider}:${credential.type}`} className="flex items-center gap-[14px] px-[16px] py-[13px] transition-colors hover:bg-accent/30">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <KeyRound className="size-[18px]" strokeWidth={1.75} />
                </span>
                <p className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium text-foreground">{credential.provider}</p>
                <span className="shrink-0 rounded-full border border-border px-2 py-[1px] font-mono text-[11px] leading-[16px] text-muted-foreground">
                  {credential.type}
                </span>
                {confirming === credential.provider ? (
                  <span className="flex shrink-0 items-center gap-[4px]">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                        void onRemove(credential.provider);
                      }}
                      className="cursor-pointer rounded-md px-[6px] py-[4px] text-[12px] leading-none text-destructive outline-none select-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {copy.settings.keysConfirmRemove}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="cursor-pointer rounded-md px-[6px] py-[4px] text-[12px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {copy.dialogs.cancel}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(credential.provider)}
                    className="shrink-0 cursor-pointer rounded-md px-[6px] py-[4px] text-[12px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {copy.settings.keysRemove}
                  </button>
                )}
              </SettingsCard>
            ))}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col items-start gap-[12px] rounded-xl border border-border bg-card px-[20px] py-[16px]"
        >
          <div className="flex w-full gap-[12px]">
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={copy.settings.keysProviderField}
              aria-label={copy.settings.keysProviderField}
              className={`${fieldClassName} w-[260px] shrink-0`}
            />
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={copy.settings.keysKeyField}
              aria-label={copy.settings.keysKeyField}
              type="password"
              autoComplete="off"
              className={`${fieldClassName} min-w-0 flex-1`}
            />
          </div>
          {error !== null ? <p className="text-[12px] leading-[16px] text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.settings.keysSave}
          </button>
        </form>
      </div>
    </section>
  );
}

export { KeysSection };
