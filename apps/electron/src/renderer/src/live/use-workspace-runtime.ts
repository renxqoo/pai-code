import * as React from 'react';
import { useStore } from 'zustand';

import { effortLevelsForModel } from '@/composer/composer-selection';
import { submitQueuedDraft } from '@/composer/queued-submit';
import { connectQueuedDraftFlush } from '@/live/queued-flush';
import { panelSwitchOutcome, type PanelState } from '@/panel/panel-state';
import { bridgeClient, controller, store } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 工作区运行挂载（T34 M3，useLiveWorkspace 退役后的单一挂载点）：
 * controller 生命周期、切会话 effect（水化/会话规则/思考档/命令目录）、
 * 暂存轮末冲刷连接、面板组态会话级存档/恢复。无返回值——数据订阅全部
 * 归各区域/装配面自取；本 hook 在工作区守卫的早退分支之前无条件调用。
 */

/** 会话级面板组态档案（模块级，与草稿同档不落盘；当前态在 ui store）。 */
const panelArchive: Record<string, PanelState> = {};

export function useWorkspaceRuntime(): void {
  const activeThreadId = useStore(store, (s) => s.activeThreadId) ?? '';
  // 活跃会话生命周期态：parked → live 翻转（懒恢复完成）时切会话 effect 需要重跑
  const activeSessionState = useStore(store, (s) => (s.activeThreadId === null ? null : s.sessions[s.activeThreadId]?.state ?? null));
  // 活跃会话模型（parked 直读 get_state 补齐后变化——本地档位推导的数据源）
  const activeSessionModel = useStore(store, (s) => (s.activeThreadId === null ? null : s.sessions[s.activeThreadId]?.model ?? null));

  React.useEffect(() => {
    void controller.start();
    // cleanup 必须返回函数本身：立即调用形态会在挂载当帧置 disposed，
    // StrictMode 双挂载下两次 bootstrap 应答全部被丢弃——启动永久停留 loading
    return () => controller.dispose();
  }, []);

  // 暂存排队消息的轮末冲刷（连接器单一真相 live/queued-flush；投递实现在 composer/queued-submit）
  React.useEffect(() => connectQueuedDraftFlush(store, submitQueuedDraft), [submitQueuedDraft]);

  React.useEffect(() => {
    // 切会话（或最后一个会话被移除）先清会话级派生态：sessionRules/commands/
    // effortLevels 由 store.setActiveThread 同步清空（防渲染帧残留一帧），
    // agentDefinitions 仍在此处清（保持既有清理位置）
    store.setState({ agentDefinitions: [] });
    if (activeThreadId.length === 0) return;
    // parked 浏览态（T27）：历史经 host 直读水化（ensureHydrated 内先纳管表项——
    // 冷启动 hub 表空，读命令按 threadId 寻址；纳管零 worker 且幂等，model 元数据
    // 在同一链尾补齐）；thinkingLevels/commands/stats 是 worker 级查询——不发，
    // 思考档控件用模型能力本地推导（与新任务页同源），其余控件在 live 翻转后由本 effect 重跑补齐
    void controller.ensureHydrated(activeThreadId);
    void controller.readSessionRules(activeThreadId);
    if (activeSessionState !== 'live') {
      store.setState({ effortLevels: effortLevelsForModel(store.getState().models, activeSessionModel ?? '') });
      return;
    }
    // 思考档位随会话拉取（模型能力差异；响应回来时会话已切换则丢弃）
    void bridgeClient.invoke('session/thinkingLevels', { threadId: activeThreadId }).then((outcome) => {
      if (store.getState().activeThreadId !== activeThreadId) return;
      if (outcome.ok) store.setState({ effortLevels: outcome.data.allowed });
    });
    // 斜杠命令目录随会话拉取（thread 级；同上判活；builtin 内置命令也由 hub 下发）
    void bridgeClient.invoke('command/list', { threadId: activeThreadId }).then((outcome) => {
      if (store.getState().activeThreadId !== activeThreadId) return;
      if (outcome.ok) store.setState({ commands: outcome.data });
    });
    void controller.refreshStats(activeThreadId);
    // activeSessionModel：parked 直读补齐 model 后（sessionUpdated 推送）本地档位
    // 推导需要以新值重跑；live 路径的档位拉取幂等，重跑无害
  }, [activeThreadId, activeSessionState, activeSessionModel]);

  // 面板组态会话级存档/恢复：panel 变化即存档、切会话恢复（原 usePanelTabs 同构迁出）
  const panel = useStore(uiStore, (s) => s.panel);
  const panelThreadRef = React.useRef(activeThreadId);
  React.useEffect(() => {
    const restore = panelSwitchOutcome(panelArchive, panelThreadRef.current, activeThreadId, panel);
    if (restore === null) return;
    panelThreadRef.current = activeThreadId;
    uiStore.setState({ panel: restore });
  }, [activeThreadId, panel]);
}
