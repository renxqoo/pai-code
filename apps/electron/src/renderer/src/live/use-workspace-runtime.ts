import * as React from 'react';
import { useStore } from 'zustand';

import { panelSwitchOutcome, type PanelArchive } from '@/panel/panel-state';
import { connectSessionUiPrune } from '@/live/ui-state-prune';
import { apiClient, controller, store } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 工作区运行挂载（T34 M3，useLiveWorkspace 退役后的单一挂载点）：
 * controller 生命周期、切会话派生态清理/水化/读口、斜杠命令目录装配、
 * 面板组态会话级存档/恢复、会话消亡时的 UI 态回收。流式排队的真相与
 * 冲刷在 hub 队列（session/prompt 的 followUp 原子语义），无渲染层连接器。
 * 无返回值——数据订阅全部归各区域/装配面自取；本 hook 在工作区守卫的
 * 早退分支之前无条件调用。
 */

/** 会话级面板组态档案（模块级，与草稿同档不落盘；当前态在 ui store）。 */
const panelArchive: PanelArchive = new Map();

export function useWorkspaceRuntime(): void {
  // 活跃会话（store 真值是 string | null——判活守卫直接对拍，不做 ''↔null 往返换算）
  const activeThreadId = useStore(store, (s) => s.activeThreadId);
  // 活跃会话生命周期态：parked → live 翻转（懒恢复完成）时读口 effect 需要重跑
  const activeSessionState = useStore(store, (s) => (s.activeThreadId === null ? null : s.sessions[s.activeThreadId]?.state ?? null));
  // 宿主生命周期：就绪/重启翻转时命令目录 effect 重跑（起动窗口拉取失败自愈）
  const hostPhase = useStore(store, (s) => s.hostPhase);

  React.useEffect(() => {
    void controller.start();
    // cleanup 必须返回函数本身：立即调用形态会在挂载当帧置 disposed，
    // StrictMode 双挂载下两次 bootstrap 应答全部被丢弃——启动永久停留 loading
    return () => controller.dispose();
  }, []);

  // 会话消亡修剪：死线程的草稿槽/面板档案回收（连接器单一真相 live/ui-state-prune）
  React.useEffect(() => connectSessionUiPrune(store, uiStore, panelArchive), []);

  // agentDefinitions 随**切会话**清空（其余派生态 sessionPermissionMode/commands/
  // thinkingLevel 由 store.setActiveThread 同步清空，防渲染帧残留一帧）。只认
  // activeThreadId 变化——同线程 parked↔live 翻转不属切会话，连带清空会把闲置
  // 回收的会话里已加载的 agent 定义清没且无人重拉
  React.useEffect(() => {
    store.setState({ agentDefinitions: [] });
  }, [activeThreadId]);

  React.useEffect(() => {
    if (activeThreadId === null) return;
    const threadId = activeThreadId;
    // parked 浏览态（T27）：历史经 host 直读水化（ensureHydrated 内先纳管表项——
    // 冷启动 hub 表空，读命令按 threadId 寻址；纳管零 worker 且幂等，model 元数据
    // 在同一链尾补齐）；thinkingLevels/permission-mode 是 worker 级查询——不发
    // （防唤醒），思考档控件回落会话视图携带的 thinkingLevel，其余控件在
    // live 翻转后由本 effect 重跑补齐
    void controller.ensureHydrated(threadId).catch(() => undefined);
    if (activeSessionState !== 'live') return;
    // 权限模式随会话拉取（permission/mode；响应回来时会话已切换则丢弃）
    void controller.readSessionPermissionMode(threadId).catch(() => undefined);
    // 思考档位随会话拉取（get_thinking_level {level,source}；同上判活）
    void controller.readThinkingLevel(threadId).catch(() => undefined);
    // 用量拉取（stats + tokenAnalytics 已合并；analytics 缺席不报错，芯片回落累计口径）
    void controller.refreshUsage(threadId).catch(() => undefined);
  }, [activeThreadId, activeSessionState]);

  // 斜杠命令目录装配（`/` 补全的唯一数据源）：无会话 = 预会话目录（启用技能——
  // 首页/空线程输入框同样订阅 liveStore.commands，不供数即 commands 恒空 = `/`
  // 触发整链停用）；live = thread 级 get_commands；parked/dead 不发读口（防唤醒）
  // 且保留最近成功快照——随翻转清空会让闲置回收后 `/` 静默失效且 parked 不重拉 =
  // 永久失效。失败不写（保持既有快照），恢复全靠 deps 自愈、无定时器：hostPhase
  // 翻转（host 就绪/重启）重跑本 effect；换轨窗口撞 unknown_thread 随 resume 收养
  // 换 id（activeThreadId 变化）触发重拉
  React.useEffect(() => {
    if (activeThreadId !== null && activeSessionState !== 'live') return;
    const threadId = activeThreadId;
    let cancelled = false;
    const load = async (): Promise<void> => {
      const outcome = threadId === null ? await apiClient.command.preview({}) : await apiClient.command.list({ threadId });
      // 判活对拍丢弃过期应答（切会话/换轨在途即弃）；cancelled 丢弃被 deps 变化
      // 取代的同键在途应答（乱序回写会用旧快照盖新快照）——看似冗余，各有守卫面
      if (cancelled || store.getState().activeThreadId !== threadId) return;
      if (outcome.ok) store.setState({ commands: outcome.data });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, activeSessionState, hostPhase]);

  // 面板组态会话级存档/恢复：panel 变化即存档、切会话恢复（原 usePanelTabs 同构迁出）；
  // 旧线程已消亡（sessionRemoved 修剪刚回收死键）时跳过存档写入，防 effect 回写复活。
  // panel-state 的"无会话"键是 ''（prev.length === 0 惯例），此处局部换算
  const panelThread = activeThreadId ?? '';
  const panel = useStore(uiStore, (s) => s.panel);
  const panelThreadRef = React.useRef(panelThread);
  React.useEffect(() => {
    const prev = panelThreadRef.current;
    const restore = panelSwitchOutcome(panelArchive, prev, panelThread, panel, {
      canArchive: prev.length === 0 || prev in store.getState().sessions,
    });
    if (restore === null) return;
    panelThreadRef.current = panelThread;
    uiStore.setState({ panel: restore });
  }, [panelThread, panel]);
}
