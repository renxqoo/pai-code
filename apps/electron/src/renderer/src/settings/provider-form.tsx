import * as React from 'react';
import { Brain, ChevronDown, Eye, X } from 'lucide-react';

import type { ProviderModel, ThinkingFormat } from '@paiapp/contracts';
import { MenuButton } from '@paiapp/ui';

import { copy } from '@/strings';

export type ProviderUpsertInput = {
  name: string;
  baseUrl: string;
  api: string;
  models: ProviderModel[];
  thinkingFormat: ThinkingFormat;
  apiKey?: string;
};

type ProviderFormProps = {
  onSubmit: (input: ProviderUpsertInput) => Promise<boolean>;
  /** 编辑态预填（name/baseUrl/models/思考形态）；由外层 key 重建保证每次进入编辑态都是全新状态。 */
  initial?: { name: string; baseUrl: string; models: ProviderModel[]; thinkingFormat: ThinkingFormat } | null;
  onCancel?: () => void;
};

const fieldClassName =
  'h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60';

const thinkingFormatTriggerClassName =
  'flex h-9 w-full cursor-pointer items-center justify-between gap-[6px] rounded-lg border border-border bg-background px-3 text-left text-[13px] text-foreground outline-none hover:border-foreground/30 focus-visible:border-foreground/30 [&_svg]:shrink-0';

/** 思考形态可选项（值域来自 contracts ThinkingFormat；文案单一真相在 strings）。 */
const THINKING_FORMATS: readonly ThinkingFormat[] = ['default', 'zai', 'qwen', 'deepseek', 'openrouter', 'together', 'string-thinking', 'ant-ling'];

/** 逗号（半角/全角）或换行切分、trim、去空；重复 id 不重复入列（新录入默认不声明思考能力）。 */
function parseModelIds(raw: string): string[] {
  return raw
    .split(/[,,\n]/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** provider 表单（新增/编辑共用，onboarding 复用）：名称/地址/模型 chips（含思考·视觉开关）/思考参数形态/密钥。key 不回显；编辑态名称锁定。 */
function ProviderForm({ onSubmit, initial = null, onCancel }: ProviderFormProps) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? '');
  const [models, setModels] = React.useState<ProviderModel[]>(initial?.models ?? []);
  const [modelDraft, setModelDraft] = React.useState('');
  const [thinkingFormat, setThinkingFormat] = React.useState<ThinkingFormat>(initial?.thinkingFormat ?? 'default');
  const [apiKey, setApiKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const addModels = (raw: string): void => {
    const ids = parseModelIds(raw);
    if (ids.length === 0) return;
    setModels((prev) => {
      const next = [...prev];
      for (const id of ids) {
        if (!next.some((model) => model.id === id)) next.push({ id, reasoning: false, vision: false });
      }
      return next;
    });
  };

  const toggleReasoning = (id: string): void => {
    setModels((prev) => prev.map((model) => (model.id === id ? { ...model, reasoning: !model.reasoning } : model)));
  };

  const toggleVision = (id: string): void => {
    setModels((prev) => prev.map((model) => (model.id === id ? { ...model, vision: !model.vision } : model)));
  };

  const removeModel = (id: string): void => {
    setModels((prev) => prev.filter((model) => model.id !== id));
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const nextName = name.trim();
    const nextBaseUrl = baseUrl.trim();
    if (nextName.length === 0 || nextBaseUrl.length === 0 || models.length === 0) {
      setError(copy.settings.formIncomplete);
      return;
    }
    const ok = await onSubmit({
      name: nextName,
      baseUrl: nextBaseUrl,
      api: 'openai-completions',
      models: models.map((model) => ({ id: model.id, reasoning: model.reasoning, vision: model.vision })),
      thinkingFormat,
      apiKey: apiKey.length > 0 ? apiKey : undefined,
    });
    if (!ok) {
      setError(copy.settings.formFailed);
      return;
    }
    // 编辑态保存成功即收起（外层复位 editing，key 重建回新增态）；新增态保持清空继续录入
    if (initial !== null && onCancel !== undefined) {
      onCancel();
      return;
    }
    setName('');
    setBaseUrl('');
    setModels([]);
    setThinkingFormat('default');
    setApiKey('');
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-[12px] rounded-xl border border-border bg-card px-[20px] py-[16px]"
    >
      <p className="text-[13.5px] leading-[19px] font-semibold text-foreground">
        {initial !== null ? initial.name : copy.settings.addProvider}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={copy.settings.fieldName}
        disabled={initial !== null}
        title={initial !== null ? copy.settings.nameLocked : undefined}
        aria-label={copy.settings.fieldName}
        className={fieldClassName}
      />
      <input
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder={copy.settings.fieldBaseUrl}
        aria-label={copy.settings.fieldBaseUrl}
        className={fieldClassName}
      />
      <div className="flex min-h-9 flex-wrap items-center gap-[5px] rounded-lg border border-border bg-background px-[10px] py-[5px] outline-none focus-within:border-foreground/30">
        {models.map((model) => (
          <span
            key={model.id}
            className="flex items-center gap-[3px] rounded-md border border-border bg-muted/40 py-[1px] pr-[3px] pl-[7px] font-mono text-[11px] leading-[16px] text-foreground"
          >
            {model.id}
            <button
              type="button"
              aria-pressed={model.reasoning}
              title={model.reasoning ? copy.settings.modelThinkingOn : copy.settings.modelThinkingOff}
              onClick={() => toggleReasoning(model.id)}
              className={`flex size-4 cursor-pointer items-center justify-center rounded-[3px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 ${
                model.reasoning ? 'text-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <Brain className="size-[11px]" strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-pressed={model.vision}
              title={model.vision ? copy.settings.modelVisionOn : copy.settings.modelVisionOff}
              onClick={() => toggleVision(model.id)}
              className={`flex size-4 cursor-pointer items-center justify-center rounded-[3px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 ${
                model.vision ? 'text-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <Eye className="size-[11px]" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => removeModel(model.id)}
              className="flex size-[14px] cursor-pointer items-center justify-center rounded-[3px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-[9px]" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          value={modelDraft}
          onChange={(e) => {
            const value = e.target.value;
            if (/[,，\n]/.test(value)) {
              addModels(value);
              setModelDraft('');
            } else {
              setModelDraft(value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            if (modelDraft.trim().length === 0) return;
            e.preventDefault();
            addModels(modelDraft);
            setModelDraft('');
          }}
          placeholder={models.length === 0 ? copy.settings.fieldModels : undefined}
          aria-label={copy.settings.fieldModels}
          className="h-[22px] min-w-[120px] flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex flex-col gap-[4px]">
        <MenuButton
          aria-label={copy.settings.thinkingFormatLabel}
          align="start"
          popupMinWidth={240}
          items={THINKING_FORMATS.map((format) => ({
            kind: 'item' as const,
            id: format,
            label: copy.settings.thinkingFormatOptions[format],
            selected: format === thinkingFormat,
          }))}
          onSelect={(value) => setThinkingFormat(value as ThinkingFormat)}
          triggerClassName={thinkingFormatTriggerClassName}
          trigger={
            <>
              <span className="min-w-0 flex-1 truncate">{copy.settings.thinkingFormatOptions[thinkingFormat]}</span>
              <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
            </>
          }
        />
        <p className="text-[11px] leading-[15px] text-muted-foreground">{copy.settings.thinkingFormatHint}</p>
      </div>
      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={copy.settings.fieldKey}
        aria-label={copy.settings.fieldKey}
        type="password"
        autoComplete="off"
        className={fieldClassName}
      />
      {error !== null ? <p className="text-[12px] leading-[16px] text-destructive">{error}</p> : null}
      <div className="flex items-center gap-[10px]">
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.settings.save}
        </button>
        {onCancel !== undefined ? (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg px-[6px] py-[6px] text-[12.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.cancelEdit}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export { ProviderForm };
