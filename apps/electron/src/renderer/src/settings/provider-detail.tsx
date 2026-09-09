import * as React from "react";

import type { ProviderConfigView } from "@paiapp/contracts";

import { copy } from "@/strings";

import { ProviderEditor, type ProviderUpsertInput } from "./provider-editor";
import type { ProviderTestResult } from "./provider-test";

type ProviderDetailProps = {
  /** 编辑态渠道快照（null = 新建）。 */
  provider: ProviderConfigView | null;
  onUpsert: (input: ProviderUpsertInput) => Promise<boolean>;
  /** 渠道/模型探活（modelId 缺省 = 第一个模型；新建态无渠道可探）。 */
  onTest: (name: string, modelId?: string) => Promise<ProviderTestResult>;
  onBack: () => void;
  /** 保存成功回调（新建 = 切到新渠道详情；编辑 = 停留原地，编辑器内提示）。 */
  onSaved: (name: string) => void;
};

/** 渠道详情：面包屑返回 + 标题 + 测试连接（仅编辑态）+ 编辑器（编辑态模型行带逐模型测试）。 */
function ProviderDetail({
  provider,
  onUpsert,
  onTest,
  onBack,
  onSaved,
}: ProviderDetailProps): React.JSX.Element {
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);

  const runTest = async (): Promise<void> => {
    if (provider === null || testing) return;
    setTesting(true);
    setTestResult(null);
    const result = await onTest(provider.name);
    setTesting(false);
    setTestResult(result);
  };

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex flex-col gap-[6px]">
        <nav className="flex items-center gap-[8px] text-[13px] leading-[18px]">
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer rounded-[4px] text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.providerBackToList}
          </button>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ›
          </span>
          <span className="min-w-0 truncate font-medium text-foreground">
            {provider !== null ? provider.name : copy.settings.providerFormTitleNew}
          </span>
        </nav>
        <div className="flex items-start justify-between gap-[16px]">
          <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-foreground">
            {provider !== null
              ? copy.settings.providerFormTitleEdit
              : copy.settings.providerFormTitleNew}
          </h2>
          {provider !== null ? (
            <div className="flex shrink-0 flex-col items-end gap-[6px]">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing}
                className="h-9 cursor-pointer rounded-lg border border-border px-3 text-[12.5px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testing ? copy.settings.testing : copy.settings.testConnection}
              </button>
              {testResult !== null ? (
                <p
                  className={`text-[11.5px] leading-[16px] ${testResult.ok ? "text-muted-foreground" : "text-destructive"}`}
                >
                  {testResult.ok
                    ? copy.settings.testOk(testResult.latencyMs)
                    : copy.settings.testFailed(testResult.reason)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {provider !== null
            ? copy.settings.providerFormSubtitleEdit
            : copy.settings.providerFormSubtitleNew}
        </p>
      </div>
      <ProviderEditor
        key={provider?.name ?? "new"}
        initial={provider}
        onSubmit={onUpsert}
        onCancel={onBack}
        onSaved={onSaved}
        onTest={provider === null ? undefined : (modelId) => onTest(provider.name, modelId)}
      />
    </div>
  );
}

export { ProviderDetail };
export type { ProviderDetailProps };
