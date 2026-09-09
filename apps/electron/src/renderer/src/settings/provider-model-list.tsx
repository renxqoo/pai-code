import * as React from 'react';
import { Plus } from 'lucide-react';

import type { ProviderModel } from '@paiapp/contracts';

import { copy } from '@/strings';

import { FieldLabel } from './field-label';
import { mergeModelIds, parseModelIds, toggleModelFlag } from './model-ids';
import { ProviderModelRow } from './provider-model-row';

type ProviderModelListProps = {
  models: readonly ProviderModel[]
  onModelsChange: (models: ProviderModel[]) => void
  /** 未落表的输入草稿（保存时一并收编，避免「输入后直接点保存」被判缺失）。 */
  draft: string
  onDraftChange: (draft: string) => void
};

/** 渠道模型清单：已有模型行（能力声明/移除）+ 底部新增输入（回车或逗号收编）。 */
function ProviderModelList({ models, onModelsChange, draft, onDraftChange }: ProviderModelListProps): React.JSX.Element {
  const addDraft = (): void => {
    const ids = parseModelIds(draft);
    if (ids.length === 0) return;
    onModelsChange(mergeModelIds(models, ids));
    onDraftChange('');
  };

  const removeModel = (id: string): void => {
    onModelsChange(models.filter((model) => model.id !== id));
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel label={copy.settings.providerModelsLabel} hint={copy.settings.providerModelsHint} />
      {models.length === 0 ? (
        <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.providerModelsEmpty}</p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {models.map((model) => (
            <ProviderModelRow
              key={model.id}
              model={model}
              onToggle={(flag) => onModelsChange(toggleModelFlag(models, model.id, flag))}
              onRemove={() => removeModel(model.id)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-[8px]">
        <input
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,，\n]/.test(value)) {
              const ids = parseModelIds(value);
              if (ids.length > 0) onModelsChange(mergeModelIds(models, ids));
              onDraftChange('');
            } else {
              onDraftChange(value);
            }
          }}
          onKeyDown={(event) => {
            // 输入法组词中的回车是选字，不是提交
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            if (draft.trim().length === 0) return;
            event.preventDefault();
            addDraft();
          }}
          aria-label={copy.settings.providerModelPlaceholder}
          placeholder={copy.settings.providerModelPlaceholder}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-[12.5px] leading-[18px] text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-foreground/30"
        />
        <button
          type="button"
          onClick={addDraft}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-[6px] rounded-lg border border-border px-3 text-[12.5px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-[14px]" strokeWidth={2} />
          {copy.settings.providerModelAdd}
        </button>
      </div>
    </div>
  );
}

export { ProviderModelList };
