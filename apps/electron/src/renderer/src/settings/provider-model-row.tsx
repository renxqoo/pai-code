import * as React from "react";
import { Brain, Eye, Pencil, X, Zap } from "lucide-react";

import type { ProviderModel } from "@paiapp/contracts";
import { Spinner } from "@paiapp/ui";

import { cn } from "@/lib/utils";
import { copy } from "@/strings";

import type { ProviderTestResult } from "./provider-test";

/** 行内测试态（list 持有，行纯展示）：testing = 探测中；done = 已出结果。 */
export type ModelTestState = { phase: "testing" } | { phase: "done"; result: ProviderTestResult };

type ProviderModelRowProps = {
  model: ProviderModel;
  /** 切换能力声明（reasoning = 思考档位可选；vision = 图片不被剥）。 */
  onToggle: (flag: "reasoning" | "vision") => void;
  /** 打开编辑弹窗（id/窗口/输出上限/输入模态在弹窗维护）。 */
  onEdit: () => void;
  onRemove: () => void;
  /** 逐模型探活（编辑态注入；缺省不渲染测试按钮）。 */
  onTest?: () => void;
  /** 该行的测试态（list 持有；缺省 = 未测）。 */
  testState?: ModelTestState;
};

/** 能力开关按钮态：已声明=实心前景色，未声明=弱化（点击切换）。 */
function capabilityClassName(active: boolean): string {
  return cn(
    "flex size-7 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "text-foreground" : "text-muted-foreground/40",
  );
}

/** 模型行：id + 逐模型测试（编辑态）+ 编辑 + 思考/视觉能力开关 + 移除。 */
function ProviderModelRow({
  model,
  onToggle,
  onEdit,
  onRemove,
  onTest,
  testState,
}: ProviderModelRowProps): React.JSX.Element {
  const result = testState?.phase === "done" ? testState.result : null;
  return (
    <div className="flex items-center gap-[8px] rounded-lg border border-border bg-background px-[10px] py-[6px]">
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] leading-[18px] text-foreground">
        {model.id}
      </span>
      {result !== null ? (
        <p
          className={cn(
            "max-w-[40%] shrink-0 truncate text-[11px] leading-[15px]",
            result.ok ? "text-muted-foreground" : "text-destructive",
          )}
          title={
            result.ok
              ? copy.settings.testOk(result.latencyMs)
              : copy.settings.testFailed(result.reason)
          }
        >
          {result.ok
            ? copy.settings.testOk(result.latencyMs)
            : copy.settings.testFailed(result.reason)}
        </p>
      ) : null}
      {onTest !== undefined ? (
        <button
          type="button"
          aria-label={copy.settings.providerModelTest}
          title={copy.settings.providerModelTest}
          onClick={onTest}
          disabled={testState?.phase === "testing"}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
        >
          {testState?.phase === "testing" ? (
            <Spinner
              label={copy.settings.providerModelTest}
              className="size-[14px]"
              strokeWidth={1.75}
            />
          ) : (
            <Zap className="size-[14px]" strokeWidth={1.75} />
          )}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={copy.settings.providerModelEdit}
        title={copy.settings.providerModelEdit}
        onClick={onEdit}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Pencil className="size-[14px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-pressed={model.reasoning}
        aria-label={
          model.reasoning ? copy.settings.modelThinkingOn : copy.settings.modelThinkingOff
        }
        title={model.reasoning ? copy.settings.modelThinkingOn : copy.settings.modelThinkingOff}
        onClick={() => onToggle("reasoning")}
        className={capabilityClassName(model.reasoning)}
      >
        <Brain className="size-[14px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-pressed={model.vision}
        aria-label={model.vision ? copy.settings.modelVisionOn : copy.settings.modelVisionOff}
        title={model.vision ? copy.settings.modelVisionOn : copy.settings.modelVisionOff}
        onClick={() => onToggle("vision")}
        className={capabilityClassName(model.vision)}
      >
        <Eye className="size-[14px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={copy.settings.providerModelRemove}
        title={copy.settings.providerModelRemove}
        onClick={onRemove}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-[14px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export { ProviderModelRow };
