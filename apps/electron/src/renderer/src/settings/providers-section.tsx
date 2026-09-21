import * as React from "react";
import { ChevronDown } from "lucide-react";

import type { ProviderConfigView } from "@paiapp/contracts";

import { ActionButton, PickerDialog, selectTriggerClassName } from "@paiapp/ui";
import { groupModelOptions } from "@/components/group-model-options";
import { copy } from "@/strings";

import { ProviderDetail } from "./provider-detail";
import type { ProviderTestResult } from "./provider-test";
import type { ProviderUpsertInput } from "./provider-editor";
import { filterProviders, providerListEmptyMessage } from "./provider-list-filter";
import { ProviderRow } from "./provider-row";
import { SettingsCard } from "./settings-card";
import { SettingsPageHeader } from "./settings-page-header";
import { SettingsRow } from "./settings-row";
import { SettingsSearchInput } from "./settings-search-input";

type ProvidersSectionProps = {
  list: readonly ProviderConfigView[];
  defaultModel: string | null;
  modelOptions: readonly string[]; // "provider/modelId" 形态
  onUpsert: (input: ProviderUpsertInput) => Promise<string | null>;
  onRemove: (name: string) => Promise<string | null>;
  onSelectDefaultModel: (value: string | null) => void;
  onTest: (name: string, modelId?: string) => Promise<ProviderTestResult>;
};

type ProvidersView = { kind: "list" } | { kind: "create" } | { kind: "edit"; name: string };

/** 「不使用默认模型」项的保留 id（双下划线前缀避免与真实模型名撞车），归一为 null 提交。 */
const DEFAULT_MODEL_NONE_ID = "__none__";

/** 渠道分区：默认模型选择卡 + 渠道列表（搜索/添加/两步删除）↔ 渠道详情（钻入编辑，面包屑返回）。 */
function ProvidersSection({
  list,
  defaultModel,
  modelOptions,
  onUpsert,
  onRemove,
  onSelectDefaultModel,
  onTest,
}: ProvidersSectionProps) {
  const [view, setView] = React.useState<ProvidersView>({ kind: "list" });
  const [query, setQuery] = React.useState("");
  const [defaultPickerOpen, setDefaultPickerOpen] = React.useState(false);
  const [removeFailed, setRemoveFailed] = React.useState(false);

  const selectedDefault = defaultModel ?? copy.settings.defaultModelNone;
  // 默认模型已不在目录（渠道被删/改名）→ 触发器旁短标记 + 卡内联失效提示
  const defaultModelInvalid = defaultModel !== null && !modelOptions.includes(defaultModel);
  const editingProvider =
    view.kind === "edit" ? list.find((provider) => provider.name === view.name) : undefined;
  const visibleProviders = filterProviders(list, query);
  const emptyMessage = providerListEmptyMessage(list.length, visibleProviders.length);

  const backToList = (): void => {
    setRemoveFailed(false);
    setView({ kind: "list" });
  };

  const removeProvider = (name: string): Promise<boolean> => {
    setRemoveFailed(false);
    return onRemove(name)
      .then((reason) => {
        if (reason !== null) setRemoveFailed(true);
        return reason === null;
      })
      .catch(() => {
        setRemoveFailed(true);
        return false;
      });
  };

  if (view.kind === "create" || editingProvider !== undefined) {
    return (
      <section>
        <ProviderDetail
          key={view.kind === "edit" ? view.name : "new"}
          provider={editingProvider ?? null}
          onUpsert={onUpsert}
          onTest={onTest}
          onBack={backToList}
          onSaved={(name) => {
            // 新建保存后切到新渠道详情（可立即测试连接）；编辑保存后停留原地（编辑器内提示已保存）
            if (view.kind === "create") setView({ kind: "edit", name });
          }}
        />
      </section>
    );
  }

  return (
    <section>
      <SettingsPageHeader
        title={copy.settings.providersTitle}
        description={copy.settings.providersDesc}
      />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.defaultModelTitle}>
            <div className="flex items-center gap-[8px]">
              {defaultModelInvalid ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/40 px-2 py-[1px] text-[11px] leading-[16px] text-destructive">
                  {copy.settings.defaultModelInvalidShort}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={copy.settings.defaultModelTitle}
                aria-haspopup="dialog"
                aria-expanded={defaultPickerOpen}
                onClick={() => setDefaultPickerOpen(true)}
                className={selectTriggerClassName}
              >
                <span className="min-w-0 max-w-[220px] truncate">{selectedDefault}</span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
              </button>
              <PickerDialog
                open={defaultPickerOpen}
                onOpenChange={setDefaultPickerOpen}
                title={copy.settings.defaultModelTitle}
                searchPlaceholder={copy.modelPicker.searchPlaceholder}
                emptyLabel={copy.modelPicker.empty}
                groups={[
                  { items: [{ id: DEFAULT_MODEL_NONE_ID, label: copy.settings.defaultModelNone }] },
                  ...groupModelOptions(modelOptions),
                ]}
                selectedId={defaultModel ?? DEFAULT_MODEL_NONE_ID}
                onSelect={(id) => onSelectDefaultModel(id === DEFAULT_MODEL_NONE_ID ? null : id)}
              />
            </div>
          </SettingsRow>
          {defaultModelInvalid ? (
            <p className="px-[20px] py-[11px] text-[12px] leading-[17px] text-muted-foreground">
              {copy.settings.generalDefaultModelInvalid}
            </p>
          ) : null}
        </SettingsCard>
        <div className="flex items-center gap-[12px]">
          <span className="mr-auto text-[12.5px] leading-[18px] text-muted-foreground">
            {copy.settings.providersCount(list.length)}
          </span>
          <SettingsSearchInput
            value={query}
            onChange={setQuery}
            placeholder={copy.settings.searchProviders}
            className="w-[240px]"
          />
          <ActionButton type="button" onClick={() => setView({ kind: "create" })} size="sm">
            {copy.settings.addProvider}
          </ActionButton>
        </div>
        {removeFailed ? (
          <p className="text-[12px] leading-[16px] text-destructive">
            {copy.settings.providerRemoveFailed}
          </p>
        ) : null}
        {emptyMessage !== null ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {visibleProviders.map((provider) => (
              <ProviderRow
                key={provider.name}
                provider={provider}
                onOpen={() => setView({ kind: "edit", name: provider.name })}
                onRemove={removeProvider}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export { ProvidersSection };
