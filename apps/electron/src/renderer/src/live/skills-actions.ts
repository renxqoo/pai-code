/**
 * 技能动作组（自 live-controller 拆出——max-lines 500 纪律，纯移动）：清单拉取/
 * 启停（链式串行）/候选扫描/批量导入（T42 D5/D6：逐条隔离 + 批末单次重开）/
 * 整目录移除。编排链（chainSkills）与重开回调由控制器注入。
 */
import type { ApiClient } from '@paiapp/api/client';
import type { SkillCandidateView, SkillView } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';

import type { SkillImportRequest, SkillImportSummary } from './live-controller-types';
import type { LiveStore } from './store';

export interface SkillsActionsDeps {
  readonly api: ApiClient;
  readonly store: LiveStore;
  /** 技能编排链（开关/导入/删除共用串行化——防重开循环交错）。 */
  readonly chainSkills: <T>(run: () => Promise<T>) => Promise<T>;
  /** 重开活跃会话使技能生效（控制器会话面回调）。 */
  readonly reopenSession: (threadId: string) => Promise<boolean>;
}

export interface SkillsActions {
  refreshSkills(): Promise<void>;
  setSkillEnabled(name: string, enabled: boolean): Promise<{ ok: true; data: SkillView[] } | { ok: false; reason: string }>;
  applySkillToggle(name: string, enabled: boolean): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }>;
  scanSkillCandidates(sourcePath?: string): Promise<{ ok: true; candidates: SkillCandidateView[] } | { ok: false; reason: string }>;
  importSkills(items: readonly SkillImportRequest[]): Promise<SkillImportSummary>;
  removeSkill(name: string): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }>;
}

/** 活跃会话逐个重开（技能生效闭环）；失败计数返回。 */
async function reopenLiveSessions(deps: SkillsActionsDeps): Promise<number> {
  let reopenFailures = 0;
  for (const session of Object.values(deps.store.getState().sessions)) {
    if (session.state !== 'live') continue;
    const reopened = await deps.reopenSession(session.threadId);
    if (!reopened) reopenFailures += 1;
  }
  return reopenFailures;
}

export function createSkillsActions(deps: SkillsActionsDeps): SkillsActions {
  const { api, store, chainSkills } = deps;
  const setSkillEnabled = async (name: string, enabled: boolean): Promise<{ ok: true; data: SkillView[] } | { ok: false; reason: string }> => {
    const outcome = await api.skills.setEnabled({ name, enabled });
    if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
    store.setState({ skills: outcome.data });
    return { ok: true, data: outcome.data };
  };
  return {
    async refreshSkills(): Promise<void> {
      const outcome = await api.skills.list({});
      if (outcome.ok) store.setState({ skills: outcome.data });
    },
    setSkillEnabled,
    async applySkillToggle(name, enabled): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }> {
      // 链式排队：重开链在途时后续开关追加到队尾（持有新快照，不与在途循环交错）
      const run = async (): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }> => {
        const outcome = await setSkillEnabled(name, enabled);
        if (!outcome.ok) return { ok: false, reason: outcome.reason };
        return { ok: true, reopenFailures: await reopenLiveSessions(deps) };
      };
      return chainSkills(run);
    },
    async scanSkillCandidates(sourcePath): Promise<{ ok: true; candidates: SkillCandidateView[] } | { ok: false; reason: string }> {
      const outcome = await api.skills.candidates(sourcePath !== undefined ? { sourcePath } : {});
      if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
      return { ok: true, candidates: outcome.data.candidates };
    },
    /** 批量导入（T42 D5/D6）：串行逐条（失败逐条隔离）→ 清 skills.disabled 名单 → 批末单次重开。 */
    async importSkills(items): Promise<SkillImportSummary> {
      return chainSkills(async () => {
        const failed: Array<{ name: string; reason: string }> = [];
        let imported = 0;
        for (const item of items) {
          const label = item.name ?? item.sourcePath.split('/').filter(Boolean).pop() ?? item.sourcePath;
          const outcome = await api.skills.import(item);
          if (!outcome.ok) {
            failed.push({ name: label, reason: copyOfError(outcome.error) });
            continue;
          }
          // 生效闭环①：导入即启用——名在 skills.disabled 名单则清名单（否则导入即显示「已关闭」）
          const landed = outcome.data.skills.find((skill) => skill.name === outcome.data.imported.name && skill.source === 'user');
          if (landed !== undefined && !landed.enabled) {
            const enabled = await api.skills.setEnabled({ name: landed.name, enabled: true });
            store.setState({ skills: enabled.ok ? enabled.data : outcome.data.skills });
          } else {
            store.setState({ skills: outcome.data.skills });
          }
          imported += 1;
        }
        // D5：批末单次重开（不是每技能一次）
        const reopenFailures = imported > 0 ? await reopenLiveSessions(deps) : 0;
        return { imported, failed, reopenFailures };
      });
    },
    async removeSkill(name): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }> {
      return chainSkills(async () => {
        const outcome = await api.skills.remove({ name });
        if (!outcome.ok) return { ok: false, reason: copyOfError(outcome.error) };
        store.setState({ skills: outcome.data });
        return { ok: true, reopenFailures: await reopenLiveSessions(deps) };
      });
    },
  };
}
