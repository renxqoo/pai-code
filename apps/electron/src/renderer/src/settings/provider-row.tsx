import * as React from 'react';

import { copy } from '@/strings';
import type { ProviderConfigView } from '@paiapp/contracts';

type ProviderTestResult = { ok: true; latencyMs: number } | { ok: false; reason: string };

type ProviderRowProps = {
  provider: ProviderConfigView;
  onRemove: (name: string) => Promise<boolean>;
  onEdit?: () => void;
  onTest?: () => Promise<ProviderTestResult>;
};

/** 已配置 provider 行：名称/地址/模型与 key 状态；支持编辑、连通性测试（行内显示结果）与移除（二次确认）。 */
function ProviderRow({ provider, onRemove, onEdit, onTest }: ProviderRowProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);

  const runTest = async (): Promise<void> => {
    if (onTest === undefined || testing) return;
    setTesting(true);
    setTestResult(null);
    const result = await onTest();
    setTesting(false);
    setTestResult(result);
  };

  return (
    <div className="mb-[8px] flex items-start justify-between gap-[10px] rounded-[10px] border border-border px-[12px] py-[10px]">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium">{provider.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{provider.baseUrl}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {provider.models
            .map((model) => {
              const marks = [model.reasoning ? copy.settings.modelThinkingMark : null, model.vision ? copy.settings.modelVisionMark : null].filter((mark): mark is string => mark !== null);
              return marks.length > 0 ? `${model.id} · ${marks.join('/')}` : model.id;
            })
            .join(', ')}
          {provider.thinkingFormat !== 'default' ? ` · ${copy.settings.thinkingFormatOptions[provider.thinkingFormat]}` : ''} ·{' '}
          {provider.hasKey ? copy.settings.keyPresent : copy.settings.keyMissing}
        </p>
        {testResult !== null ? (
          <p className={testResult.ok ? 'pt-[2px] text-[11px] text-muted-foreground' : 'pt-[2px] text-[11px] text-red-600'}>
            {testResult.ok ? copy.settings.testOk(testResult.latencyMs) : copy.settings.testFailed(testResult.reason)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-[6px] pt-[2px]">
        {onEdit !== undefined ? (
          <button type="button" onClick={onEdit} className="text-[11.5px] text-muted-foreground hover:text-foreground">
            {copy.settings.editProvider}
          </button>
        ) : null}
        {onTest !== undefined ? (
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            className="text-[11.5px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testing ? copy.settings.testing : copy.settings.testConnection}
          </button>
        ) : null}
        {confirming ? (
          <>
            <button type="button" onClick={() => void onRemove(provider.name)} className="text-[11.5px] text-red-600 hover:underline">
              {copy.settings.confirmRemove}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-[11.5px] text-muted-foreground hover:underline">
              {copy.dialogs.cancel}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="shrink-0 text-[11.5px] text-muted-foreground hover:text-foreground">
            {copy.settings.remove}
          </button>
        )}
      </div>
    </div>
  );
}

export { ProviderRow };
