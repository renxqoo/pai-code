/**
 * 插件动作组（plugin-runtime §M4，skills-actions 同构）：清单拉取/启停/
 * 候选扫描/批量导入（逐条隔离 + 热装编排）/移除。编排链（chainSkills 共用——
 * 重开循环与热装串行化）与重开回调由控制器注入。
 * 热生效分叉：启停/导入后活跃会话走 plugins/hot_install（world 内即时装载），
 * 失败降级「重开生效」——与技能面「恒重开」刻意不同（插件支持热装）。
 */
import type { ApiClient } from '@paiapp/api/client';
import type { PluginCandidateView, PluginProposalRow, PluginView } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';

import type { PluginImportRequest, PluginImportSummary } from './live-controller-types';
import type { LiveStore } from './store';

export interface PluginsActionsDeps {
  readonly api: ApiClient;
  readonly store: LiveStore;
  /** 与技能面共用的编排链（开关/导入/删除串行化——防热装与重开交错）。 */
  readonly chainSkills: <T>(run: () => Promise<T>) => Promise<T>;
  /** 重开活跃会话（热装失败降级通路）。 */
  readonly reopenSession: (threadId: string) => Promise<boolean>;
}

export interface PluginsActions {
  refreshPlugins(): Promise<void>;
  /** agent 提案面板（plugin_propose 登记态直读） */
  listPluginProposals(): Promise<{ ok: true; proposals: PluginProposalRow[] } | { ok: false; reason: string }>;
  /** 确认提案（host 内存置位——文件伪造不可达） */
  confirmPluginProposal(proposalId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** 拒绝提案 */
  rejectPluginProposal(proposalId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  setPluginEnabled(name: string, enabled: boolean): Promise<{ ok: true; data: PluginView[] } | { ok: false; reason: string }>;
  applyPluginToggle(name: string, enabled: boolean): Promise<{ ok: true; hotFailures: number } | { ok: false; reason: string }>;
  scanPluginCandidates(sourcePath?: string): Promise<{ ok: true; candidates: PluginCandidateView[] } | { ok: false; reason: string }>;
  importPlugins(items: readonly PluginImportRequest[]): Promise<PluginImportSummary>;
  removePlugin(name: string): Promise<{ ok: true; hotFailures: number } | { ok: false; reason: string }>;
}

/** 活跃会话热装该插件；失败降级重开。返回热装失败数（重开失败并入）。 */
async function hotInstallEverywhere(deps: PluginsActionsDeps, name: string): Promise<number> {
  let failures = 0;
  for (const session of Object.values(deps.store.getState().sessions)) {
    if (session.state !== 'live') continue;
    const hot = await deps.api.plugins.hotInstall({ threadId: session.threadId, name }).catch(() => null);
    if (hot?.ok) continue;
    // 降级：重开会话（装配期装载——worker 重建后按 registry 现装）
    const reopened = await deps.reopenSession(session.threadId);
    if (!reopened) failures += 1;
  }
  return failures;
}

/** 活跃会话热卸该插件（disable/remove 的即时生效面）；失败降级重开。 */
async function hotUninstallEverywhere(deps: PluginsActionsDeps, name: string): Promise<number> {
  let failures = 0;
  for (const session of Object.values(deps.store.getState().sessions)) {
    if (session.state !== 'live') continue;
    const hot = await deps.api.plugins.hotUninstall({ threadId: session.threadId, name, force: false }).catch(() => null);
    if (hot?.ok) continue;
    const reopened = await deps.reopenSession(session.threadId);
    if (!reopened) failures += 1;
  }
  return failures;
}

export function createPluginsActions(deps: PluginsActionsDeps): PluginsActions {
  const { api, store, chainSkills } = deps;
  const setPluginEnabled = async (name: string, enabled: boolean): Promise<{ ok: true; data: PluginView[] } | { ok: false; reason: string }> => {
    const outcome = await api.plugins.setEnabled({ name, enabled });
    if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
    store.setState({ plugins: outcome.data });
    return { ok: true, data: outcome.data };
  };
  return {
    async refreshPlugins(): Promise<void> {
      const outcome = await api.plugins.list({});
      if (outcome.ok) store.setState({ plugins: outcome.data });
    },
    async listPluginProposals(): Promise<{ ok: true; proposals: PluginProposalRow[] } | { ok: false; reason: string }> {
      const outcome = await api.plugins.proposals({});
      if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
      return { ok: true, proposals: outcome.data.proposals };
    },
    async confirmPluginProposal(proposalId): Promise<{ ok: true } | { ok: false; reason: string }> {
      const outcome = await api.plugins.confirmProposal({ proposalId });
      if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
      return { ok: true };
    },
    async rejectPluginProposal(proposalId): Promise<{ ok: true } | { ok: false; reason: string }> {
      const outcome = await api.plugins.rejectProposal({ proposalId });
      if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
      return { ok: true };
    },
    setPluginEnabled,
    async applyPluginToggle(name, enabled): Promise<{ ok: true; hotFailures: number } | { ok: false; reason: string }> {
      return chainSkills(async () => {
        const outcome = await setPluginEnabled(name, enabled);
        if (!outcome.ok) return { ok: false, reason: outcome.reason };
        const hotFailures = enabled
          ? await hotInstallEverywhere(deps, name)
          : await hotUninstallEverywhere(deps, name);
        return { ok: true, hotFailures };
      });
    },
    async scanPluginCandidates(sourcePath): Promise<{ ok: true; candidates: PluginCandidateView[] } | { ok: false; reason: string }> {
      const outcome = await api.plugins.candidates(sourcePath !== undefined ? { sourcePath } : {});
      if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
      return { ok: true, candidates: outcome.data.candidates };
    },
    /** 批量导入：串行逐条（失败逐条隔离）→ 写后清单回读 → 逐会话热装（失败降级重开）。 */
    async importPlugins(items): Promise<PluginImportSummary> {
      return chainSkills(async () => {
        const failed: Array<{ name: string; reason: string }> = [];
        let imported = 0;
        let hotFailures = 0;
        for (const item of items) {
          const label = item.sourcePath.split('/').filter(Boolean).pop() ?? item.sourcePath;
          const outcome = await api.plugins.import({ sourcePath: item.sourcePath, overwrite: item.overwrite });
          if (!outcome.ok) {
            failed.push({ name: label, reason: copyOfError(outcome.error) });
            continue;
          }
          store.setState({ plugins: outcome.data.plugins });
          imported += 1;
          hotFailures += await hotInstallEverywhere(deps, outcome.data.imported.name);
        }
        return { imported, failed, reopenFailures: hotFailures };
      });
    },
    async removePlugin(name): Promise<{ ok: true; hotFailures: number } | { ok: false; reason: string }> {
      return chainSkills(async () => {
        const outcome = await api.plugins.remove({ name });
        if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
        store.setState({ plugins: outcome.data });
        return { ok: true, hotFailures: await hotUninstallEverywhere(deps, name) };
      });
    },
  };
}
