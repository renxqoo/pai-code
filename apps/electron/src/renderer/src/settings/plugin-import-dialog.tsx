/** 导入插件对话框外壳：状态（选择集/忙碌/汇总）+ Base UI Dialog；关态零渲染。
 *  来源 = 手选目录扫描（批准根收窄）；risk 行 = P2 审批语义明示（不弱化）。
 *  内容件在 plugin-import-content（一组件一文件纪律）。 */
import * as React from 'react';

import type { PluginCandidateView } from '@paiapp/contracts';

import { copy } from '@/strings';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@paiapp/ui';

import type { PluginImportRequest, PluginImportSummary } from '@/live/live-controller-types';

import { buildPluginImportItems, PluginImportContent, type PluginRowSelection } from './plugin-import-content';

type PluginImportDialogProps = {
  open: boolean;
  /** 候选（null = 扫描中）；判定三态来自 hub plugins/inspect。 */
  candidates: readonly PluginCandidateView[] | null;
  /** 当前已装插件名（冲突预标「已安装」）。 */
  installedNames: readonly string[];
  onScan: (sourcePath?: string) => void;
  onPickFolder: () => void;
  onImport: (items: readonly PluginImportRequest[]) => Promise<PluginImportSummary>;
  onClose: () => void;
};

function PluginImportDialog(props: PluginImportDialogProps): React.JSX.Element | null {
  const { open, candidates, installedNames, onScan, onPickFolder, onImport, onClose } = props;
  const [selections, setSelections] = React.useState(new Map<string, PluginRowSelection>());
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<PluginImportSummary | null>(null);

  if (!open) return null;

  const toggleRow = (candidate: PluginCandidateView): void => {
    if (candidate.state === 'blocked') return;
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.sourcePath)) next.delete(candidate.sourcePath);
      else next.set(candidate.sourcePath, { overwrite: false });
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
    const items = buildPluginImportItems(candidates ?? [], selections);
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
          <DialogTitle>{copy.settings.pluginImportTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginImportDesc}</p>
        <p className="text-[12px] leading-[17px] text-destructive">{copy.settings.pluginImportRisk}</p>
        <PluginImportContent
          candidates={candidates}
          installedNames={installedNames}
          selections={selections}
          busy={busy}
          summary={summary}
          onToggleRow={toggleRow}
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

export { PluginImportDialog };
