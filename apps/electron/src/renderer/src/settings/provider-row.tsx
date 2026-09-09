import * as React from 'react';
import { Boxes, Pencil, Trash2 } from 'lucide-react';

import type { ProviderConfigView } from '@paiapp/contracts';
import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';

export type ProviderTestResult = { ok: true; latencyMs: number } | { ok: false; reason: string };

type ProviderRowProps = {
  provider: ProviderConfigView
  onRemove: (name: string) => Promise<boolean>
  onEdit: () => void
  onTest: () => Promise<ProviderTestResult>
}

/** key 状态 pill：绿点=已保存 / 红点=缺少（状态色是页面上仅有的彩色语义）。 */
function keyStatusBadge(hasKey: boolean): React.JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
      <span aria-hidden="true" className={`size-[6px] shrink-0 rounded-full ${hasKey ? 'bg-dot-done' : 'bg-stop'}`} />
      {hasKey ? copy.settings.keyPresent : copy.settings.keyMissing}
    </span>
  );
}

/** 已配置 provider 卡：名称+key 状态、地址、模型能力摘要；支持编辑、连通性测试（行内结果）与移除（二次确认）。 */
function ProviderRow({ provider, onRemove, onEdit, onTest }: ProviderRowProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);

  const runTest = async (): Promise<void> => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    const result = await onTest();
    setTesting(false);
    setTestResult(result);
  };

  const summary = provider.models
    .map((model) => {
      const marks = [model.reasoning ? copy.settings.modelThinkingMark : null, model.vision ? copy.settings.modelVisionMark : null].filter((mark): mark is string => mark !== null);
      return marks.length > 0 ? `${model.id} · ${marks.join('/')}` : model.id;
    })
    .join(', ');
  const summaryWithFormat =
    provider.thinkingFormat !== 'default' && summary.length > 0 ? `${summary} · ${copy.settings.thinkingFormatOptions[provider.thinkingFormat]}` : summary;

  return (
    <SettingsCard className="flex items-start gap-[14px] px-[16px] py-[14px] transition-colors hover:bg-accent/30">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Boxes className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[8px]">
          <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{provider.name}</p>
          {keyStatusBadge(provider.hasKey)}
        </div>
        <p className="mt-[2px] truncate text-[12px] leading-[17px] text-muted-foreground">{provider.baseUrl}</p>
        {summaryWithFormat.length > 0 ? (
          <p className="mt-[2px] line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">{summaryWithFormat}</p>
        ) : null}
        {testResult !== null ? (
          <p className={`mt-[4px] text-[11.5px] leading-[16px] ${testResult.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
            {testResult.ok ? copy.settings.testOk(testResult.latencyMs) : copy.settings.testFailed(testResult.reason)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-[4px]">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                // 移除失败停留确认态，可立即重试；成功才回普通态
                void onRemove(provider.name).then((ok) => {
                  if (!ok) setConfirming(true);
                });
              }}
              className="cursor-pointer rounded-md px-[6px] py-[4px] text-[12px] leading-none text-destructive outline-none select-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {copy.settings.confirmRemove}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer rounded-md px-[6px] py-[4px] text-[12px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {copy.dialogs.cancel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testing}
              className="h-8 cursor-pointer rounded-lg border border-border px-3 text-[12px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing ? copy.settings.testing : copy.settings.testConnection}
            </button>
            <IconButton label={copy.settings.editProvider} size="sm" onClick={onEdit}>
              <Pencil strokeWidth={1.75} />
            </IconButton>
            <IconButton label={copy.settings.remove} size="sm" onClick={() => setConfirming(true)}>
              <Trash2 strokeWidth={1.75} />
            </IconButton>
          </>
        )}
      </div>
    </SettingsCard>
  );
}

export { ProviderRow };
