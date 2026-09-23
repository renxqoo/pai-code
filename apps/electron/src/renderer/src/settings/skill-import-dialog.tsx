/**
 * 导入技能对话框外壳：状态（选择集/忙碌/汇总）+ Base UI Dialog；关态零渲染。
 * 来源 = 三个内置源根自动扫描，「选择文件夹…」走系统目录对话框（批准根收窄）。
 * 内容件在 skill-import-content（一组件一文件纪律）。
 */
import * as React from 'react';

import type { SkillCandidateView } from '@paiapp/contracts';

import { copy } from '@/strings';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@paiapp/ui';

import type { SkillImportRequest, SkillImportSummary } from '@/live/live-controller-types';

import { buildImportItems, SkillImportContent, type RowSelection } from './skill-import-content';

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

export { SkillImportDialog };
