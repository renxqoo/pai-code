import * as React from 'react';

import { copy } from '@/strings';

type KeysSectionProps = {
  credentials: ReadonlyArray<{ provider: string; type: string }>
  onSaveKey: (provider: string, apiKey: string) => Promise<boolean>
  onRemoveKey: (provider: string) => Promise<boolean>
  onRefresh: () => void
}

/** API keys 分区：已存凭据列表（类型可见、key 不回显，移除需确认）+ 新增表单。 */
function KeysSection({ credentials, onSaveKey, onRemoveKey, onRefresh }: KeysSectionProps) {
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
    const ok = await onSaveKey(nextProvider, nextKey);
    setSaving(false);
    if (!ok) return;
    setProvider('');
    setApiKey('');
  };

  return (
    <section>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.keysTitle}</p>
        <button type="button" onClick={onRefresh} className="text-[11.5px] text-muted-foreground hover:text-foreground">
          {copy.settings.refresh}
        </button>
      </div>
      <p className="pb-[8px] text-[11.5px] text-muted-foreground">{copy.settings.keysHint}</p>
      {credentials.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.keysEmpty}</p> : null}
      {credentials.map((credential) => (
        <div
          key={`${credential.provider}:${credential.type}`}
          className="mb-[8px] flex items-center justify-between gap-[10px] rounded-[10px] border border-border px-[12px] py-[10px]"
        >
          <div className="flex min-w-0 items-center gap-[8px]">
            <span className="truncate text-[12.5px] font-medium text-foreground">{credential.provider}</span>
            <span className="shrink-0 rounded-full border border-border px-[7px] py-[1px] font-mono text-[10px] leading-[15px] text-muted-foreground">
              {credential.type}
            </span>
          </div>
          {confirming === credential.provider ? (
            <div className="flex shrink-0 gap-[6px]">
              <button
                type="button"
                onClick={() => {
                  setConfirming(null);
                  void onRemoveKey(credential.provider);
                }}
                className="text-[11.5px] text-red-600 hover:underline"
              >
                {copy.settings.keysConfirmRemove}
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="text-[11.5px] text-muted-foreground hover:underline">
                {copy.dialogs.cancel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(credential.provider)}
              className="shrink-0 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              {copy.settings.keysRemove}
            </button>
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-[8px] rounded-[10px] border border-dashed border-border px-[12px] py-[12px]"
      >
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder={copy.settings.keysProviderField}
          className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25"
        />
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={copy.settings.keysKeyField}
          type="password"
          autoComplete="off"
          className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25"
        />
        {error !== null ? <p className="text-[11.5px] text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="h-[30px] self-start rounded-[8px] bg-foreground px-[14px] text-[12px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {copy.settings.keysSave}
        </button>
      </form>
    </section>
  );
}

export { KeysSection };
