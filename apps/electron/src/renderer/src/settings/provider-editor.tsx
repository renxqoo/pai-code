import * as React from 'react';

import type { ProviderConfigView, ProviderModel, ThinkingFormat } from '@paiapp/contracts';
import { ThinkingFormatSchema } from '@paiapp/contracts';

import { copy } from '@/strings';

import { apiFormatOptions } from './api-format-options';
import { mergeModelIds, parseModelIds } from './model-ids';
import { ProviderKeyField } from './provider-key-field';
import { ProviderModelList } from './provider-model-list';
import { SelectField } from './select-field';
import { TextField } from './text-field';

/** OpenAI 兼容协议 id：新建渠道的缺省格式（绝大多数自建端点），也是思考形态参数的适用条件。 */
const OPENAI_COMPAT_API = 'openai-completions';

export type ProviderUpsertInput = {
  name: string
  baseUrl: string
  api: string
  models: ProviderModel[]
  thinkingFormat: ThinkingFormat
  /** 省略 = 保持已存 key；空串 = 清除（清除走 ProviderKeyField 的独立动作）。 */
  apiKey?: string
};

type ProviderEditorProps = {
  /** 编辑态预填（null = 新建）；由外层 key 重建保证每次进入都是全新状态。 */
  initial: ProviderConfigView | null
  onSubmit: (input: ProviderUpsertInput) => Promise<boolean>
  /** 取消/返回列表；onboarding 不传（提交成功后清空继续录入）。 */
  onCancel?: () => void
  /** 保存成功回调（settings 传：新建切到新渠道详情、编辑停留详情）；不传则清空字段。 */
  onSaved?: (name: string) => void
};

/**
 * 提交视图：必填校验 + 归一。模型输入框里尚未落表的草稿一并计入——
 * 输入模型 id 后直接点保存（未回车收编）也视为已填模型，不误报必填缺失。
 * 思考形态只对 OpenAI 兼容协议有意义：其余格式归 'default'（序列化侧同样门控）。
 */
export function buildProviderSubmit(fields: {
  name: string
  baseUrl: string
  api: string
  models: readonly ProviderModel[]
  modelDraft: string
  thinkingFormat: ThinkingFormat
  apiKey: string
}): { ok: true; input: ProviderUpsertInput } | { ok: false; reason: 'incomplete' } {
  const name = fields.name.trim();
  const baseUrl = fields.baseUrl.trim();
  const api = fields.api.trim();
  const models = mergeModelIds(fields.models, parseModelIds(fields.modelDraft));
  if (name.length === 0 || baseUrl.length === 0 || api.length === 0 || models.length === 0) {
    return { ok: false, reason: 'incomplete' };
  }
  const thinkingFormat = api === OPENAI_COMPAT_API ? fields.thinkingFormat : 'default';
  return {
    ok: true,
    input: {
      name,
      baseUrl,
      api,
      models,
      thinkingFormat,
      ...(fields.apiKey.length > 0 ? { apiKey: fields.apiKey } : {}),
    },
  };
}

/** 渠道编辑器（新建/编辑共用，onboarding 复用）：名称/地址/API 格式/思考形态/密钥/模型清单。key 不回显。 */
function ProviderEditor({ initial, onSubmit, onCancel, onSaved }: ProviderEditorProps): React.JSX.Element {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? '');
  const [api, setApi] = React.useState(initial?.api ?? OPENAI_COMPAT_API);
  const [models, setModels] = React.useState<ProviderModel[]>(initial === null ? [] : [...initial.models]);
  const [draft, setDraft] = React.useState('');
  const [thinkingFormat, setThinkingFormat] = React.useState<ThinkingFormat>(initial?.thinkingFormat ?? 'default');
  const [apiKey, setApiKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const hasKey = initial?.hasKey ?? false;

  /** 清除已存 key：用磁盘现值 upsert 空 key（与表单草稿无关，避免未保存编辑被顺带写入）。 */
  const clearKey = async (): Promise<boolean> => {
    if (initial === null) return false;
    return onSubmit({
      name: initial.name,
      baseUrl: initial.baseUrl,
      api: initial.api,
      models: [...initial.models],
      thinkingFormat: initial.thinkingFormat,
      apiKey: '',
    });
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    const payload = buildProviderSubmit({ name, baseUrl, api, models, modelDraft: draft, thinkingFormat, apiKey });
    if (!payload.ok) {
      setError(copy.settings.formIncomplete);
      return;
    }
    setSaving(true);
    const ok = await onSubmit(payload.input);
    setSaving(false);
    if (!ok) {
      setError(copy.settings.formFailed);
      return;
    }
    setApiKey('');
    if (onSaved !== undefined) {
      setSaved(true);
      onSaved(payload.input.name);
      return;
    }
    if (onCancel !== undefined) {
      onCancel();
      return;
    }
    setName('');
    setBaseUrl('');
    setApi(OPENAI_COMPAT_API);
    setModels([]);
    setDraft('');
    setThinkingFormat('default');
    setApiKey('');
  };

  // 文案按当前 locale 在渲染期解析（模块级常量会把语言冻结在导入时刻）
  const thinkingFormatOptions = ThinkingFormatSchema.options.map((id) => ({ id, label: copy.settings.thinkingFormatOptions[id] }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-[20px] rounded-xl border border-border bg-card px-[24px] py-[22px]"
    >
      <div className="flex items-start gap-[16px]">
        <div className="w-[280px] shrink-0">
          <TextField
            id="provider-name"
            label={copy.settings.providerFieldName}
            hint={copy.settings.providerFieldNameHint}
            value={name}
            onChange={setName}
            disabled={initial !== null}
            autoFocus={initial === null}
          />
        </div>
        <TextField
          id="provider-base-url"
          label={copy.settings.providerFieldBaseUrl}
          hint={copy.settings.providerFieldBaseUrlHint}
          value={baseUrl}
          onChange={setBaseUrl}
          mono
          placeholder="https://open.bigmodel.cn/api/paas/v4"
        />
      </div>
      <div className="flex items-start gap-[16px]">
        <div className="w-[320px] shrink-0">
          <SelectField
            label={copy.settings.providerFieldApi}
            hint={copy.settings.providerFieldApiHint}
            value={api}
            options={apiFormatOptions(api)}
            onChange={setApi}
            popupMinWidth={320}
          />
        </div>
        {api === OPENAI_COMPAT_API ? (
          <div className="w-[280px] shrink-0">
            <SelectField
              label={copy.settings.thinkingFormatLabel}
              hint={copy.settings.thinkingFormatHint}
              value={thinkingFormat}
              options={thinkingFormatOptions}
              onChange={(id) => setThinkingFormat(id)}
              popupMinWidth={280}
            />
          </div>
        ) : null}
      </div>
      <ProviderKeyField value={apiKey} onChange={setApiKey} hasKey={hasKey} onClear={clearKey} />
      <ProviderModelList models={models} onModelsChange={setModels} draft={draft} onDraftChange={setDraft} />
      <div className="flex items-center justify-end gap-[12px]">
        {error !== null ? (
          <p className="mr-auto min-w-0 text-[12px] leading-[16px] text-destructive">{error}</p>
        ) : saved ? (
          <p className="mr-auto text-[12px] leading-[16px] text-muted-foreground">{copy.settings.providerSaved}</p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
        >
          {copy.settings.save}
        </button>
        {onCancel !== undefined ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-9 cursor-pointer rounded-lg px-3 text-[12.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
          >
            {copy.settings.cancelEdit}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export { ProviderEditor };
export type { ProviderEditorProps };
