import type { PanelArchive } from '@/panel/panel-state';
import type { UiStore } from '@/ui/ui-store';
import type { LiveStore } from './store';

/**
 * 会话消亡时的 UI 态回收：sessionRemoved 后线程 id 不复用（重开/懒恢复/宿主重启
 * 一律换新 id），按 id 寻址的 UI 态——会话草稿槽（ui store）与面板组态档案
 * （模块档案）——随 sessions 表差集回收。宿主死亡只终态化 threads、不清 sessions
 * 表，bootstrap 合并只补缺，差集即确定性移除，无误伤窗口。queuedDrafts 不在此列：
 * 暂存消息有按 sessionPath 改绑机器（重开接续投递，见 queued-flush）。
 */
export function connectSessionUiPrune(store: LiveStore, uiStore: UiStore, panelArchive: PanelArchive): () => void {
  let prevIds = new Set(Object.keys(store.getState().sessions));
  return store.subscribe((state) => {
    const removed = [...prevIds].filter((id) => !(id in state.sessions));
    prevIds = new Set(Object.keys(state.sessions));
    if (removed.length === 0) return;
    const drafts = uiStore.getState().drafts;
    const kept = Object.fromEntries(Object.entries(drafts).filter(([id]) => !removed.includes(id)));
    if (Object.keys(kept).length !== Object.keys(drafts).length) uiStore.setState({ drafts: kept });
    for (const id of removed) panelArchive.delete(id);
  });
}
