/** 插件导入面板内容（自 plugin-import-dialog 拆出——一组件一文件纪律）：
 *  候选列表（勾选多选 + 三态徽章 + 诊断）+ 覆盖同名显式确认 + 执行汇总。
 *  与 Dialog 外壳分离 = 可 SSR 测试（Base UI Portal 纪律——skill-import-content 同款）。 */
import * as React from 'react';

import type { PluginCandidateView } from '@paiapp/contracts';

import { copy } from '@/strings';

import { ActionButton } from '@paiapp/ui';

import type { PluginImportRequest, PluginImportSummary } from '@/live/live-controller-types';

/** 行选择态（overwrite = 显式覆盖同名；插件名 = manifest 声明名，不可改写——
 *  名字即 vendor 目录隔离单元，改名 = 目录换名，由源目录自决）。 */
export type PluginRowSelection = { overwrite: boolean };

/** 选择集 → 导入请求（blocked 不可选）。 */
export function buildPluginImportItems(
  candidates: readonly PluginCandidateView[],
  selections: ReadonlyMap<string, PluginRowSelection>,
): PluginImportRequest[] {
  const items: PluginImportRequest[] = [];
  for (const candidate of candidates) {
    const selection = selections.get(candidate.sourcePath);
    if (selection === undefined || candidate.state === 'blocked') continue;
    items.push({ sourcePath: candidate.sourcePath, overwrite: selection.overwrite });
  }
  return items;
}

/** 诊断 → 文案（blocked 携自然语言串——problem 非码表；rename 补充说明）。 */
function problemText(candidate: PluginCandidateView): string | null {
  if (candidate.state === 'blocked') return candidate.problem ?? copy.settings.pluginProblemBlocked;
  if (candidate.state === 'rename') return copy.settings.pluginProblemRename;
  return null;
}

type PluginImportContentProps = {
  candidates: readonly PluginCandidateView[] | null;
  installedNames: readonly string[];
  selections: ReadonlyMap<string, PluginRowSelection>;
  busy: boolean;
  summary: PluginImportSummary | null;
  onToggleRow: (candidate: PluginCandidateView) => void;
  onToggleOverwrite: (sourcePath: string) => void;
  onRun: () => void;
  onScan: () => void;
  onPickFolder: () => void;
  onClose: () => void;
};

export function PluginImportContent({
  candidates,
  installedNames,
  selections,
  busy,
  summary,
  onToggleRow,
  onToggleOverwrite,
  onRun,
  onScan,
  onPickFolder,
  onClose,
}: PluginImportContentProps): React.JSX.Element {
  const rows = candidates ?? [];
  const items = buildPluginImportItems(rows, selections);
  const canRun = !busy && items.length > 0;

  if (summary !== null) {
    return (
      <div className="flex flex-col gap-[8px]" data-testid="plugin-import-summary">
        <p className="text-[13px] leading-[18px] text-foreground">
          {summary.imported === 0 && summary.failed.length === 0
            ? copy.settings.pluginImportDoneNone
            : copy.settings.pluginImportDone(summary.imported, summary.failed.length)}
        </p>
        {summary.failed.map((failure) => (
          <p key={failure.name} className="text-[12px] leading-[17px] text-muted-foreground">
            {copy.settings.pluginImportSummaryItem(failure.name, failure.reason)}
          </p>
        ))}
        <div className="flex justify-end">
          <ActionButton onClick={onClose}>{copy.settings.pluginImportClose}</ActionButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-[8px]">
        <ActionButton variant="outline" onClick={onPickFolder}>{copy.settings.pluginImportPickFolder}</ActionButton>
        <ActionButton variant="quiet" onClick={onScan} disabled={busy}>{copy.settings.pluginImportRescan}</ActionButton>
      </div>
      <div className="flex max-h-[320px] flex-col gap-[8px] overflow-y-auto">
        {candidates === null ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.pluginImportScanning}</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.pluginImportEmpty}</p>
        ) : (
          rows.map((candidate) => {
            const selection = selections.get(candidate.sourcePath);
            const selected = selection !== undefined;
            const exists = installedNames.includes(candidate.name);
            const problem = problemText(candidate);
            return (
              <div key={candidate.sourcePath} className="flex flex-col gap-[4px] rounded-lg border border-border px-[12px] py-[10px]">
                <label className="flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy || candidate.state === 'blocked'}
                    onChange={() => onToggleRow(candidate)}
                    aria-label={copy.settings.pluginToggleLabel(candidate.name)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-foreground">{candidate.name}</span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                    {copy.settings.pluginCandidateState[candidate.state]}
                  </span>
                  {exists ? (
                    <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                      {copy.settings.pluginImportExists}
                    </span>
                  ) : null}
                </label>
                {problem !== null ? (
                  <p className="text-[12px] leading-[17px] text-muted-foreground">{problem}</p>
                ) : null}
                {selected && selection !== undefined && exists ? (
                  <label className="flex items-center gap-[6px] text-[12px] leading-[17px] text-muted-foreground">
                    <input type="checkbox" checked={selection.overwrite} disabled={busy} onChange={() => onToggleOverwrite(candidate.sourcePath)} />
                    {copy.settings.pluginImportOverwrite}
                  </label>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-end gap-[8px]">
        <ActionButton variant="outline" onClick={onClose} disabled={busy}>{copy.settings.pluginImportClose}</ActionButton>
        <ActionButton onClick={onRun} disabled={!canRun}>{busy ? copy.settings.pluginImportRunning : copy.settings.pluginImportRun}</ActionButton>
      </div>
    </>
  );
}
