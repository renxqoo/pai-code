import * as React from 'react';

import { PickerDialog } from '@/components/picker-dialog';
import { AgentPanel } from '@/agent-panel/agent-panel';
import { DiffPanel } from '@/diff-panel/diff-panel';
import { FilePane } from '@/panel/file-pane';
import { PanelDock } from '@/panel/panel-dock';
import { panelTabLabel } from '@/panel/panel-state';
import { copy } from '@/strings';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import type { PanelTabs } from '@/screens/use-panel-tabs';

type PanelLayerProps = {
  panels: PanelTabs
  workspace: LiveWorkspaceView
}

/** 面板层渲染：多标签 Dock（活跃 pane 内容）+「打开文件…」选择弹窗。 */
function PanelLayer({ panels, workspace }: PanelLayerProps) {
  const { panel, activePanelTab, closePanelTabById, focusPanelTabById, closePanel, openFileTab, readFile } = panels;
  /** PanelDock 是 memo 边界：tab 视图数组 memo 化（panel.tabs 引用仅在面板操作时变化）。 */
  const dockTabs = React.useMemo(
    () => panel.tabs.map((tab) => ({ id: tab.id, label: panelTabLabel(tab, { diff: copy.panel.tabDiff, agents: copy.panel.tabAgents }) })),
    [panel.tabs],
  );
  return (
    <>
      {panel.tabs.length === 0 ? null : (
        <PanelDock
          tabs={dockTabs}
          activeId={panel.activeId}
          onSelect={focusPanelTabById}
          onCloseTab={closePanelTabById}
          onClose={closePanel}
          closeAria={copy.panel.close}
          closeTabAria={copy.panel.closeTab}
        >
          {activePanelTab?.kind === 'agents' ? (
            <AgentPanel agents={workspace.activeThread.agents} now={workspace.now} onSteer={workspace.actions.steerSubagent} />
          ) : activePanelTab?.kind === 'diff' ? (
            <DiffPanel diff={workspace.threadDiff} onOpenFile={openFileTab} />
          ) : activePanelTab?.kind === 'file' && activePanelTab.cwd !== undefined && activePanelTab.path !== undefined ? (
            <FilePane cwd={activePanelTab.cwd} path={activePanelTab.path} readProjectFile={readFile} />
          ) : null}
        </PanelDock>
      )}
      <PickerDialog
        open={panels.filePickerOpen}
        onOpenChange={panels.setFilePickerOpen}
        title={copy.panel.file.openPickerTitle}
        searchPlaceholder={copy.panel.file.openPickerSearch}
        emptyLabel={copy.panel.file.openPickerEmpty}
        groups={[{ items: panels.filePickerItems.map((path) => ({ id: path, label: path })) }]}
        selectedId={null}
        onSelect={openFileTab}
      />
    </>
  );
}

const PanelLayerMemo = React.memo(PanelLayer);
export { PanelLayerMemo as PanelLayer };
