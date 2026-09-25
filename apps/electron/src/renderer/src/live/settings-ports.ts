import { isSettableThinkingLevel } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';
import type { ApiClient } from '@paiapp/api/client';
import type { HubSettingsView, LiveStore, SessionPermissionModeView } from './store';

/**
 * 配置面读写口（controller 的会话域动作之外）：saved/models 目录刷新、hub 级
 * 权限/思考档缺省读写、会话级权限/思考档读口。判活与引用幂等语义随方法走：
 * 请求在途期间活跃会话切换即丢弃（防旧会话视图覆盖新会话）；内容相同不换引用
 * （下游菜单依赖引用，防刷新循环击穿交互）。
 */
export interface SettingsPortsDeps {
  readonly api: ApiClient;
  readonly store: LiveStore;
}

export function createSettingsPorts({ api, store }: SettingsPortsDeps) {
  /** hub 缺省真相更新后刷新活跃会话的生效视图（权限模式随 hub settings 变化的回读）。 */
  const refreshActivePermissionMode = async (): Promise<void> => {
    const active = store.getState().activeThreadId;
    if (active === null) return;
    await readSessionPermissionMode(active).catch(() => undefined);
  };

  /** 只拉 hub 用户级缺省（app/hubSettings；新任务页权限控件与设置页共用的数据源）。 */
  const readHubSettingsIntoStore = async (): Promise<HubSettingsView | null> => {
    const outcome = await api.app.hubSettings({});
    if (!outcome.ok) return null;
    store.setState({ hubSettings: outcome.data });
    return outcome.data;
  };

  async function refreshSaved(): Promise<void> {
    const outcome = await api.session.listSaved({});
    if (outcome.ok) {
      // saved 列表直接进 store（避免与 bootstrap 动作耦合）
      store.setState({ saved: outcome.data });
    }
  }

  async function refreshModels(): Promise<void> {
    const outcome = await api.models.list({});
    if (outcome.ok) store.setState({ models: outcome.data });
  }

  async function readSessionPermissionMode(threadId: string): Promise<SessionPermissionModeView | null> {
    const outcome = await api.permission.mode({ threadId });
    if (!outcome.ok) return null;
    // 判活：请求在途期间活跃会话已切换则丢弃（防旧会话模式覆盖新会话视图；与目录刷新同型）
    if (store.getState().activeThreadId !== threadId) return null;
    // 引用幂等：内容相同不换引用（下游菜单依赖引用，防刷新循环击穿用户交互）；
    // modes 逐项比较（host 词表变化也要换引用——选项面随读口数据走）
    const current = store.getState().sessionPermissionMode;
    const sameModes = current !== null && current.modes.length === outcome.data.modes.length && current.modes.every((value, index) => value === outcome.data.modes[index]);
    if (current !== null && current.mode === outcome.data.mode && current.source === outcome.data.source && sameModes) {
      return current;
    }
    store.setState({ sessionPermissionMode: outcome.data });
    return outcome.data;
  }

  return {
    refreshSaved,
    refreshModels,
    async readHubSettings(): Promise<HubSettingsView | null> {
      return readHubSettingsIntoStore();
    },
    async writeHubSettings(patch: { permissionDefaultMode?: string | null; thinkingDefault?: string | null }): Promise<string | null> {
      // 思考档词表校验（词表外值 hub 静默忽略——渲染层先行拒绝，不发空载荷）
      if (patch.thinkingDefault !== undefined && patch.thinkingDefault !== null && !isSettableThinkingLevel(patch.thinkingDefault)) {
        return 'thinkingInvalid';
      }
      // null = 不修改该键（「未设置」在 hub 侧无协议表达，settings/set 无删除语义）——
      // undefined 与 null 同为跳过，全空补丁直接成功不发命令
      if (patch.permissionDefaultMode == null && patch.thinkingDefault == null) return null;
      const outcome = await api.app.setHubSettings({
        ...(patch.permissionDefaultMode != null ? { permissionDefaultMode: patch.permissionDefaultMode } : {}),
        ...(patch.thinkingDefault != null ? { thinkingDefault: patch.thinkingDefault } : {}),
      });
      if (!outcome.ok) return copyOfError(outcome.error);
      // 写后回读成套刷新（设置页与新任务页共用同一真相）
      await readHubSettingsIntoStore();
      await refreshActivePermissionMode();
      return null;
    },
    readSessionPermissionMode,
    async setSessionPermissionMode(threadId: string, mode: string): Promise<string | null> {
      const outcome = await api.permission.setMode({ threadId, mode });
      return outcome.ok ? null : copyOfError(outcome.error);
    },
    async readThinkingLevel(threadId: string): Promise<{ level: string; source: 'session' | 'project' | 'user' | 'off' } | null> {
      const outcome = await api.session.thinkingLevels({ threadId });
      if (!outcome.ok) return null;
      if (store.getState().activeThreadId !== threadId) return null;
      store.setState({ thinkingLevel: outcome.data });
      return outcome.data;
    },
  };
}

export type SettingsPorts = ReturnType<typeof createSettingsPorts>;
