import * as React from 'react';

import { copy } from '@/strings';

export type ProviderUpsertInput = { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string };

type ProviderFormProps = {
  onSubmit: (input: ProviderUpsertInput) => Promise<boolean>;
};

/** 新增 provider 表单：OpenAI 兼容接入（名称/地址/模型/密钥）。key 输入不回显。 */
function ProviderForm({ onSubmit }: ProviderFormProps) {
  const [name, setName] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [modelId, setModelId] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    if (name.trim().length === 0 || baseUrl.trim().length === 0 || modelId.trim().length === 0) {
      setError(copy.settings.formIncomplete);
      return;
    }
    const ok = await onSubmit({
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      api: 'openai-completions',
      models: modelId.split(',').map((id) => id.trim()).filter((id) => id.length > 0),
      apiKey: apiKey.length > 0 ? apiKey : undefined,
    });
    if (!ok) {
      setError(copy.settings.formFailed);
      return;
    }
    setName('');
    setBaseUrl('');
    setModelId('');
    setApiKey('');
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-[8px] rounded-[10px] border border-dashed border-border px-[12px] py-[12px]"
    >
      <p className="text-[11.5px] font-medium text-muted-foreground">{copy.settings.addProvider}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.settings.fieldName} className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25" />
      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={copy.settings.fieldBaseUrl} className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25" />
      <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder={copy.settings.fieldModels} className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25" />
      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={copy.settings.fieldKey}
        type="password"
        autoComplete="off"
        className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] text-[12px] outline-none focus:border-foreground/25"
      />
      {error !== null ? <p className="text-[11.5px] text-red-600">{error}</p> : null}
      <button type="submit" className="h-[30px] self-start rounded-[8px] bg-foreground px-[14px] text-[12px] font-medium text-background hover:bg-foreground/90">
        {copy.settings.save}
      </button>
    </form>
  );
}

export { ProviderForm };
