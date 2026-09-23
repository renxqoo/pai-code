import * as React from 'react';

import type { SkillCandidateView } from '@paiapp/contracts';
import { isInstallableSkillName } from '@paiapp/api';

import { copy } from '@/strings';

import { ActionButton, Dialog, DialogContent, DialogHeader, DialogTitle } from '@paiapp/ui';

import type { SkillImportRequest, SkillImportSummary } from '@/live/live-controller-types';

type SkillImportDialogProps = {
  open: boolean;
  /** 候选（null = 扫描中）；判定三态来自 hub skills/inspect。 */
  candidates: readonly SkillCandidateView[] | null;
  /** 当前已装技能名（冲突预标「已安装」）。 */
  installedNames: readonly string[];
  onScan: (sourcePath?: string) => void;
  onPickFolder: () => void;
  onImport: (items: readonly SkillImportRequest[]) => Promise<SkillImportSummary>;
  onClose: () => void;
};

/** 行选择态（目标名可改；overwrite = 显式覆盖同名）。 */
export type RowSelection = { name: string; overwrite: boolean };

/** 选择集 → 导入请求（blocked 不可选；名字围栏由 canRun 把关）。 */
export function buildImportItems(
  candidates: readonly SkillCandidateView[],
  selections: ReadonlyMap<string, RowSelection>,
): SkillImportRequest[] {
  const items: SkillImportRequest[] = [];
  for (const candidate of candidates) {
    const selection = selections.get(candidate.sourcePath);
    if (selection === undefined || candidate.state === 'blocked') continue;
    items.push({
      sourcePath: candidate.sourcePath,
      name: selection.name !== candidate.name ? selection.name : undefined,
      overwrite: selection.overwrite,
    });
  }
  return items;
}

/** 诊断码 → 文案（键集与 hub SkillProblem 闭集对齐；未知码不显诊断行）。 */
function problemText(candidate: SkillCandidateView): string | null {
  if (candidate.problem === null) return null;
  return copy.settings.skillProblem[candidate.problem as keyof typeof copy.settings.skillProblem] ?? null;
}

type SkillImportContentProps = {
  candidates: readonly SkillCandidateView[] | null;
  installedNames: readonly string[];
  selections: ReadonlyMap<string, RowSelection>;
  busy: boolean;
  summary: SkillImportSummary | null;
  onToggleRow: (candidate: SkillCandidateView) => void;
  onRenameRow: (sourcePath: string, name: string) => void;
  onToggleOverwrite: (sourcePath: string) => void;
  onRun: () => void;
  onScan: () => void;
  onPickFolder: () => void;
  onClose: () => void;
};

/**
 * 导入面板内容（T42 M3）：候选列表（勾选多选 + 目标名可改 + 三态徽章 + 诊断）
 * + 覆盖同名显式确认 + 执行汇总（逐条失败明细）。与 Dialog 外壳分离 = 可 SSR 测试
 * （Base UI Popup 走 Portal，仓内对话框内容一律抽内容组件后测——provider-model-dialog 同款）。
 */
function SkillImportContent({
  candidates,
  installedNames,
  selections,
  busy,
  summary,
  onToggleRow,
  onRenameRow,
  onToggleOverwrite,
  onRun,
  onScan,
  onPickFolder,
  onClose,
}: SkillImportContentProps): React.JSX.Element {
  const rows = candidates ?? [];
  const items = buildImportItems(rows, selections);
  const namesInvalid = items.some((item) => item.name !== undefined && !isInstallableSkillName(item.name));
  const canRun = !busy && items.length > 0 && !namesInvalid;

  if (summary !== null) {
    return (
      <div className="flex flex-col gap-[8px]" data-testid="skill-import-summary">
        <p className="text-[13px] leading-[18px] text-foreground">
          {summary.imported === 0 && summary.failed.length === 0
            ? copy.settings.skillImportDoneNone
            : copy.settings.skillImportDone(summary.imported, summary.failed.length)}
        </p>
        {summary.failed.map((failure) => (
          <p key={failure.name} className="text-[12px] leading-[17px] text-muted-foreground">
            {copy.settings.skillImportSummaryItem(failure.name, failure.reason)}
          </p>
        ))}
        <div className="flex justify-end">
          <ActionButton onClick={onClose}>{copy.settings.skillImportClose}</ActionButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-[8px]">
        <ActionButton variant="outline" onClick={onPickFolder}>{copy.settings.skillImportPickFolder}</ActionButton>
        <ActionButton variant="quiet" onClick={onScan} disabled={busy}>{copy.settings.skillImportRescan}</ActionButton>
      </div>
      <div className="flex max-h-[320px] flex-col gap-[8px] overflow-y-auto">
        {candidates === null ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.skillImportScanning}</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.skillImportEmpty}</p>
        ) : (
          rows.map((candidate) => {
            const selection = selections.get(candidate.sourcePath);
            const selected = selection !== undefined;
            const exists = installedNames.includes(selection?.name ?? candidate.name);
            const problem = problemText(candidate);
            const nameInvalid = selected && selection !== undefined && !isInstallableSkillName(selection.name);
            return (
              <div key={candidate.sourcePath} className="flex flex-col gap-[4px] rounded-lg border border-border px-[12px] py-[10px]">
                <label className="flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy || candidate.state === 'blocked'}
                    onChange={() => onToggleRow(candidate)}
                    aria-label={copy.settings.skillImportNameLabel(candidate.name)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-foreground">{candidate.name}</span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                    {copy.settings.skillOrigin[candidate.origin]}
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                    {copy.settings.skillCandidateState[candidate.state]}
                  </span>
                  {exists ? (
                    <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                      {copy.settings.skillImportExists}
                    </span>
                  ) : null}
                </label>
                {problem !== null ? (
                  <p className="text-[12px] leading-[17px] text-muted-foreground">{problem}</p>
                ) : null}
                {selected && selection !== undefined ? (
                  <div className="flex items-center gap-[8px]">
                    <input
                      type="text"
                      value={selection.name}
                      disabled={busy}
                      onChange={(event) => onRenameRow(candidate.sourcePath, event.target.value)}
                      className="w-[240px] rounded-md border border-border bg-background px-[8px] py-[4px] text-[12.5px] text-foreground"
                      aria-label={copy.settings.skillImportNameLabel(candidate.name)}
                    />
                    {selection.name !== candidate.name ? (
                      <span className="text-[12px] leading-[17px] text-muted-foreground">
                        {copy.settings.skillImportRenameTo(candidate.name, selection.name)}
                      </span>
                    ) : null}
                    {exists ? (
                      <label className="flex items-center gap-[6px] text-[12px] leading-[17px] text-muted-foreground">
                        <input type="checkbox" checked={selection.overwrite} disabled={busy} onChange={() => onToggleOverwrite(candidate.sourcePath)} />
                        {copy.settings.skillImportOverwrite}
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {nameInvalid ? (
                  <p className="text-[12px] leading-[17px] text-destructive">{copy.settings.skillImportNameInvalid}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-end gap-[8px]">
        <ActionButton variant="outline" onClick={onClose} disabled={busy}>{copy.settings.skillImportClose}</ActionButton>
        <ActionButton onClick={onRun} disabled={!canRun}>{busy ? copy.settings.skillImportRunning : copy.settings.skillImportRun}</ActionButton>
      </div>
    </>
  );
}

/**
 * 导入技能对话框外壳：状态（选择集/忙碌/汇总）+ Base UI Dialog；关态零渲染。
 * 来源 = 三个内置源根自动扫描，「选择文件夹…」走系统目录对话框（批准根收窄）。
 */
function SkillImportDialog(props: SkillImportDialogProps): React.JSX.Element | null {
  const { open, candidates, installedNames, onScan, onPickFolder, onImport, onClose } = props;
  const [selections, setSelections] = React.useState(new Map<string, RowSelection>());
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<SkillImportSummary | null>(null);

  if (!open) return null;

  const toggleRow = (candidate: SkillCandidateView): void => {
    if (candidate.state === 'blocked') return;
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.sourcePath)) next.delete(candidate.sourcePath);
      else next.set(candidate.sourcePath, { name: candidate.name, overwrite: false });
      return next;
    });
  };
  const renameRow = (sourcePath: string, name: string): void => {
    setSelections((prev) => {
      const next = new Map(prev);
      const selection = next.get(sourcePath);
      if (selection === undefined) return prev;
      next.set(sourcePath, { ...selection, name });
      return next;
    });
  };
  const toggleOverwrite = (sourcePath: string): void => {
    setSelections((prev) => {
      const next = new Map(prev);
      const selection = next.get(sourcePath);
      if (selection === undefined) return prev;
      next.set(sourcePath, { ...selection, overwrite: !selection.overwrite });
      return next;
    });
  };
  const run = (): void => {
    const items = buildImportItems(candidates ?? [], selections);
    if (busy || items.length === 0) return;
    setBusy(true);
    void onImport(items).then((result) => {
      setSummary(result);
      setBusy(false);
      setSelections(new Map());
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{copy.settings.skillImportTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.skillImportDesc}</p>
        <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.skillImportRisk}</p>
        <SkillImportContent
          candidates={candidates}
          installedNames={installedNames}
          selections={selections}
          busy={busy}
          summary={summary}
          onToggleRow={toggleRow}
          onRenameRow={renameRow}
          onToggleOverwrite={toggleOverwrite}
          onRun={run}
          onScan={() => onScan(undefined)}
          onPickFolder={onPickFolder}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

export { SkillImportContent, SkillImportDialog };
