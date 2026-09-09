import * as React from "react";
import { Plus } from "lucide-react";

import type { ProviderModel } from "@paiapp/contracts";

import { copy } from "@/strings";

import { FieldLabel } from "./field-label";
import { toggleModelFlag } from "./model-ids";
import { ProviderModelDialog } from "./provider-model-dialog";
import { ProviderModelRow, type ModelTestState } from "./provider-model-row";
import type { ProviderTestResult } from "./provider-test";

type ProviderModelListProps = {
  models: readonly ProviderModel[];
  onModelsChange: (models: ProviderModel[]) => void;
  /** 逐模型探活（编辑态注入；缺省不渲染行内测试按钮）。 */
  onTest?: (modelId: string) => Promise<ProviderTestResult>;
};

/** 弹窗确认落表：新建（previousId = null）追加；编辑按原 id 原位替换（id 本身可能被改）。 */
export function upsertModel(
  models: readonly ProviderModel[],
  model: ProviderModel,
  previousId: string | null,
): ProviderModel[] {
  return previousId === null
    ? [...models, model]
    : models.map((existing) => (existing.id === previousId ? model : existing));
}

/** 弹窗会话：null = 关闭；打开期间挂载、关闭即卸载（重开必为 initial 干净表单）。 */
type ModelDialogSession = { mode: "add" | "edit"; initial: ProviderModel | null };

/** 渠道模型清单：已有模型行（测试/编辑/能力声明/移除）+ 添加按钮（弹窗录入 id/窗口/输出上限/模态）。
 * 行内测试态由本组件持有（行纯展示）：testing 期间防重入，结果按模型 id 记忆（模型行卸载自然丢弃）。 */
function ProviderModelList({
  models,
  onModelsChange,
  onTest,
}: ProviderModelListProps): React.JSX.Element {
  const [session, setSession] = React.useState<ModelDialogSession | null>(null);
  const [testStates, setTestStates] = React.useState<Record<string, ModelTestState>>({});

  /** 丢弃某模型的行内测试态（删除/改名后旧结果不得复现到新行）。 */
  const forgetTestState = (id: string): void => {
    setTestStates((current) => {
      const next: Record<string, ModelTestState> = {};
      for (const [key, value] of Object.entries(current)) {
        if (key !== id) next[key] = value;
      }
      return next;
    });
  };

  const removeModel = (id: string): void => {
    onModelsChange(models.filter((model) => model.id !== id));
    forgetTestState(id);
  };

  /** 弹窗确认：落表后关闭弹窗。 */
  const confirmModel = (model: ProviderModel, previousId: string | null): void => {
    onModelsChange(upsertModel(models, model, previousId));
    if (previousId !== null && previousId !== model.id) forgetTestState(previousId);
    setSession(null);
  };

  /** 行内测试：置 testing → 探活 → 落结果（失败也落，原因原样展示）。 */
  const runModelTest = async (modelId: string): Promise<void> => {
    if (onTest === undefined || testStates[modelId]?.phase === "testing") return;
    setTestStates((current) => ({ ...current, [modelId]: { phase: "testing" } }));
    const result = await onTest(modelId);
    setTestStates((current) => ({ ...current, [modelId]: { phase: "done", result } }));
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel
        label={copy.settings.providerModelsLabel}
        hint={copy.settings.providerModelsHint}
      />
      {models.length === 0 ? (
        <p className="text-[12px] leading-[17px] text-muted-foreground">
          {copy.settings.providerModelsEmpty}
        </p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {models.map((model) => (
            <ProviderModelRow
              key={model.id}
              model={model}
              onToggle={(flag) => onModelsChange(toggleModelFlag(models, model.id, flag))}
              onEdit={() => setSession({ mode: "edit", initial: model })}
              onRemove={() => removeModel(model.id)}
              onTest={onTest === undefined ? undefined : () => void runModelTest(model.id)}
              testState={testStates[model.id]}
            />
          ))}
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => setSession({ mode: "add", initial: null })}
          className="flex h-9 cursor-pointer items-center gap-[6px] rounded-lg border border-border px-3 text-[12.5px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-[14px]" strokeWidth={2} />
          {copy.settings.providerModelAdd}
        </button>
      </div>
      {session === null ? null : (
        <ProviderModelDialog
          open
          mode={session.mode}
          initial={session.initial}
          existingIds={models
            .filter((model) => model.id !== session.initial?.id)
            .map((model) => model.id)}
          onConfirm={confirmModel}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}

export { ProviderModelList };
