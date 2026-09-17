import * as React from 'react';
import { useStore } from 'zustand';

import { submitQueuedDraft } from '@/composer/queued-submit';
import { connectQueuedDraftFlush } from '@/live/queued-flush';
import { panelSwitchOutcome, type PanelArchive } from '@/panel/panel-state';
import { connectSessionUiPrune } from '@/live/ui-state-prune';
import { bridgeClient, controller, store } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 工作区运行挂载（T34 M3，useLiveWorkspace 退役后的单一挂载点）：
 * controller 生命周期、切会话 effect（水化/权限模式/思考档/命令目录）、
 * 暂存轮末冲刷连接、面板组态会话级存档/恢复、会话消亡时的 UI 态回收。
 * 无返回值——数据订阅全部归各区域/装配面自取；本 hook 在工作区守卫的
 * 早退分支之前无条件调用。
 */

/** 会话级面板组态档案（模块级，与草稿同档不落盘；当前态在 ui store）。 */
const panelArchive: PanelArchive = new Map();

export function useWorkspaceRuntime(): void {
  const activeThreadId = useStore(store, (s) => s.activeThreadId) ?? '';
  // 活跃会话生命周期态：parked → live 翻转（懒恢复完成）时切会话 effect 需要重跑
  const activeSessionState = useStore(store, (s) => (s.activeThreadId === null ? null : s.sessions[s.activeThreadId]?.state ?? null));

  React.useEffect(() => {
    void controller.start();
    // cleanup 必须返回函数本身：立即调用形态会在挂载当帧置 disposed，
    // StrictMode 双挂载下两次 bootstrap 应答全部被丢弃——启动永久停留 loading
    return () => controller.dispose();
  }, []);

  // 暂存排队消息的轮末冲刷（连接器单一真相 live/queued-flush；投递实现在 composer/queued-submit）
  React.useEffect(() => connectQueuedDraftFlush(store, submitQueuedDraft), [submitQueuedDraft]);

  // 会话消亡修剪：死线程的草稿槽/面板档案回收（连接器单一真相 live/ui-state-prune）
  React.useEffect(() => connectSessionUiPrune(store, uiStore, panelArchive), []);

  React.useEffect(() => {
    // 切会话（或最后一个会话被移除）先清会话级派生态：sessionPermissionMode/
    // commands/thinkingLevel 由 store.setActiveThread 同步清空（防渲染帧残留一帧），
    // agentDefinitions 仍在此处清（保持既有清理位置）
    store.setState({ agentDefinitions: [] });
    if (activeThreadId.length === 0) return;
    // parked 浏览态（T27）：历史经 host 直读水化（ensureHydrated 内先纳管表项——
    // 冷启动 hub 表空，读命令按 threadId 寻址；纳管零 worker 且幂等，model 元数据
    // 在同一链尾补齐）；thinkingLevels/commands/permission-mode 是 worker 级查询——
    // 不发（防唤醒），思考档控件回落会话视图携带的 thinkingLevel，其余控件在
    // live 翻转后由本 effect 重跑补齐
    void controller.ensureHydrated(activeThreadId);
    if (activeSessionState !== 'live') {
      // parked worker 已死：斜杠命令目录/权限模式/思考档读口是 worker 级查询，
      // 随翻转清空（唤醒后由 live 路径重拉）
      store.setState({ commands: [] });
      return;
    }
    // 权限模式随会话拉取（permission/mode；响应回来时会话已切换则丢弃）
    void controller.readSessionPermissionMode(activeThreadId).catch(() => undefined);
    // 思考档位随会话拉取（get_thinking_level {level,source}；同上判活）
    void controller.readThinkingLevel(activeThreadId).catch(() => undefined);
    // 斜杠命令目录随会话拉取（thread 级；同上判活；builtin 内置命令也由 hub 下发）
    void bridgeClient.invoke('command/list', { threadId: activeThreadId }).then((outcome) => {
      if (store.getState().activeThreadId !== activeThreadId) return;
      if (outcome.ok) store.setState({ commands: outcome.data });
    });
    void controller.refreshStats(activeThreadId);
  }, [activeThreadId, activeSessionState]);

  // 面板组态会话级存档/恢复：panel 变化即存档、切会话恢复（原 usePanelTabs 同构迁出）；
  // 旧线程已消亡（sessionRemoved 修剪刚回收死键）时跳过存档写入，防 effect 回写复活
  const panel = useStore(uiStore, (s) => s.panel);
  const panelThreadRef = React.useRef(activeThreadId);
  React.useEffect(() => {
    const prev = panelThreadRef.current;
    const restore = panelSwitchOutcome(panelArchive, prev, activeThreadId, panel, {
      canArchive: prev.length === 0 || prev in store.getState().sessions,
    });
    if (restore === null) return;
    panelThreadRef.current = activeThreadId;
    uiStore.setState({ panel: restore });
  }, [activeThreadId, panel]);
}
