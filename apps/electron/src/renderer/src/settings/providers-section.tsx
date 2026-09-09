import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import type { ProviderConfigView, ProviderModel, ThinkingFormat } from '@paiapp/contracts';
import { MenuButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';
import { SettingsSearchInput } from './settings-search-input';
import { ProviderForm } from './provider-form';
import { ProviderRow, type ProviderTestResult } from './provider-row';

type ProvidersSectionProps = {
  list: readonly ProviderConfigView[]
  defaultModel: string | null
  modelOptions: readonly string[]  // "provider/modelId" 形态
  onUpsert: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat: ThinkingFormat; apiKey?: string }) => Promise<boolean>
  onRemove: (name: string) => Promise<boolean>
  onSelectDefaultModel: (value: string | null) => void
  onTest: (name: string) => Promise<ProviderTestResult>
}

/** 默认模型下拉触发器：select 观感（描边胶囊 + chevron）。 */
const defaultModelTriggerClassName =
  'flex h-9 cursor-pointer items-center justify-between gap-[8px] rounded-lg border border-border bg-background px-3 text-left text-[13px] text-foreground outline-none select-none hover:border-foreground/30 aria-expanded:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

const defaultModelTriggerMinWidth = 240;

function defaultModelItems(modelOptions: readonly string[], selected: string) {
  const noneValue = copy.settings.defaultModelNone;
  return [noneValue, ...modelOptions].map((option) => ({
    kind: 'item' as const,
    id: option,
    label: option,
    selected: option === selected,
  }));
}

/** 本地过滤：provider 名称 / baseUrl / 模型 id 包含匹配（大小写不敏感）。 */
function providerMatchesQuery(provider: ProviderConfigView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (
    provider.name.toLowerCase().includes(q) ||
    provider.baseUrl.toLowerCase().includes(q) ||
    provider.models.some((model) => model.id.toLowerCase().includes(q))
  );
}

/** Providers 分区：默认模型选择卡 + 搜索 + provider 卡列表（编辑/测试/移除）+ 黑按钮展开新增表单。 */
function ProvidersSection({ list, defaultModel, modelOptions, onUpsert, onRemove, onSelectDefaultModel, onTest }: ProvidersSectionProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const selectedDefault = defaultModel ?? copy.settings.defaultModelNone;
  // 默认模型已不在目录（provider 被删/改名）→ 触发器旁短标记 + 卡内联失效提示
  const defaultModelInvalid = defaultModel !== null && !modelOptions.includes(defaultModel);
  const editingProvider = editing === null ? undefined : list.find((provider) => provider.name === editing);
  const visibleProviders = list.filter((provider) => providerMatchesQuery(provider, query));

  const openEdit = (name: string): void => {
    setAdding(false);
    setEditing(name);
  };

  return (
    <section>
      <SettingsPageHeader title={copy.settings.providersTitle} description={copy.settings.providersDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.defaultModelTitle}>
            <span className="flex items-center gap-[8px]">
              {defaultModelInvalid ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/40 px-2 py-[1px] text-[11px] leading-[16px] text-destructive">
                  {copy.settings.defaultModelInvalidShort}
                </span>
              ) : null}
              <MenuButton
                aria-label={copy.settings.defaultModelTitle}
                align="end"
                popupMinWidth={defaultModelTriggerMinWidth}
                items={defaultModelItems(modelOptions, selectedDefault)}
                onSelect={(value) => onSelectDefaultModel(value === copy.settings.defaultModelNone ? null : value)}
                triggerClassName={defaultModelTriggerClassName}
                trigger={
                  <>
                    <span className="min-w-0 max-w-[220px] truncate">{selectedDefault}</span>
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
                  </>
                }
              />
            </span>
          </SettingsRow>
          {defaultModelInvalid ? (
            <p className="px-[20px] py-[11px] text-[12px] leading-[17px] text-muted-foreground">
              {copy.settings.generalDefaultModelInvalid}
            </p>
          ) : null}
        </SettingsCard>
        {list.length === 0 ? null : (
          <div className="flex justify-end">
            <SettingsSearchInput value={query} onChange={setQuery} placeholder={copy.settings.searchModels} className="w-[280px]" />
          </div>
        )}
        {list.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.providersEmpty}</p>
        ) : visibleProviders.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.searchNoResults}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {visibleProviders.map((provider) => (
              <ProviderRow
                key={provider.name}
                provider={provider}
                onRemove={onRemove}
                onEdit={() => openEdit(provider.name)}
                onTest={() => onTest(provider.name)}
              />
            ))}
          </div>
        )}
        {editing !== null && editingProvider !== undefined ? (
          <ProviderForm
            key={`edit-${editing}`}
            onSubmit={onUpsert}
            initial={{
              name: editingProvider.name,
              baseUrl: editingProvider.baseUrl,
              models: editingProvider.models.map((model) => ({ id: model.id, reasoning: model.reasoning, vision: model.vision })),
              thinkingFormat: editingProvider.thinkingFormat,
            }}
            onCancel={() => setEditing(null)}
          />
        ) : adding ? (
          <ProviderForm key="add" onSubmit={onUpsert} onCancel={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-9 cursor-pointer self-start rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.addProvider}
          </button>
        )}
      </div>
    </section>
  );
}

export { ProvidersSection };
