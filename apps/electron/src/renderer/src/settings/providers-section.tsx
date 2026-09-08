import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import type { ProviderConfigView, ProviderModel, ThinkingFormat } from '@paiapp/contracts';
import { MenuButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { ProviderForm } from './provider-form';
import { ProviderRow } from './provider-row';

type ProvidersSectionProps = {
  providers: readonly ProviderConfigView[]
  defaultModel: string | null
  modelOptions: readonly string[]  // "provider/modelId" 形态
  onUpsertProvider: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat: ThinkingFormat; apiKey?: string }) => Promise<boolean>
  onRemoveProvider: (name: string) => Promise<boolean>
  onSelectDefaultModel: (value: string | null) => void
  onTestProvider: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>
}

/** composer 菜单触发样式的缩小版，用于分区行内。 */
const defaultModelTriggerClassName =
  'flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-1 pl-[6px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

function defaultModelItems(modelOptions: readonly string[], selected: string) {
  const noneValue = copy.settings.defaultModelNone;
  return [noneValue, ...modelOptions].map((option) => ({
    kind: 'item' as const,
    id: option,
    label: option,
    selected: option === selected,
  }));
}

/** Providers 分区：默认模型选择 + 已配置 provider 列表（编辑/测试/移除）+ 新增与编辑共用表单。 */
function ProvidersSection({
  providers,
  defaultModel,
  modelOptions,
  onUpsertProvider,
  onRemoveProvider,
  onSelectDefaultModel,
  onTestProvider,
}: ProvidersSectionProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const selectedDefault = defaultModel ?? copy.settings.defaultModelNone;
  // 1c 挂账核销：默认模型已不在目录（provider 被删/改名）→ 内联失效提示
  const defaultModelInvalid = defaultModel !== null && !modelOptions.includes(defaultModel);
  const editingProvider = editing === null ? undefined : providers.find((provider) => provider.name === editing);
  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {copy.settings.providersTitle}
      </p>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="text-[11.5px] text-muted-foreground">{copy.settings.defaultModelTitle}</p>
        <MenuButton
          aria-label={copy.settings.defaultModelTitle}
          align="end"
          popupMinWidth={200}
          items={defaultModelItems(modelOptions, selectedDefault)}
          onSelect={(value) => onSelectDefaultModel(value === copy.settings.defaultModelNone ? null : value)}
          triggerClassName={defaultModelTriggerClassName}
          trigger={
            <>
              <span className="max-w-[220px] truncate">{selectedDefault}</span>
              <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
            </>
          }
        />
      </div>
      {defaultModelInvalid ? (
        <p className="pb-[6px] text-[11px] leading-[15px] text-muted-foreground/80">{copy.settings.generalDefaultModelInvalid}</p>
      ) : null}
      {providers.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.providersEmpty}</p> : null}
      {providers.map((provider) => (
        <ProviderRow
          key={provider.name}
          provider={provider}
          onRemove={onRemoveProvider}
          onEdit={() => setEditing(provider.name)}
          onTest={() => onTestProvider(provider.name)}
        />
      ))}
      <ProviderForm
        key={editing ?? 'new'}
        onSubmit={onUpsertProvider}
        initial={
          editingProvider === undefined
            ? null
            : {
                name: editingProvider.name,
                baseUrl: editingProvider.baseUrl,
                models: editingProvider.models.map((model) => ({ id: model.id, reasoning: model.reasoning, vision: model.vision })),
                thinkingFormat: editingProvider.thinkingFormat,
              }
        }
        onCancel={editing === null ? undefined : () => setEditing(null)}
      />
    </section>
  );
}

export { ProvidersSection };
