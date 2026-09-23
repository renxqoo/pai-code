/**
 * 设置页资源动作（技能 + 插件两族——自 workspace-actions 拆出，文件行数宪法）：
 * 透传 controller 动作组并包装失败 notice（布尔/汇总面给 use-settings-screen）。
 * 生效语义分叉：技能 = 写后恒重开；插件 = 活跃会话热装/热卸（失败降级重开）。
 */
import { copy } from '@/strings';

import type { LiveController, PluginImportRequest, PluginImportSummary, SkillImportRequest, SkillImportSummary } from './live-controller-types';

export interface ResourceActionsDeps {
  readonly controller: LiveController;
  readonly pushNotice: (message: string) => void;
}

export function resourceActions(deps: ResourceActionsDeps) {
  const { controller, pushNotice } = deps;
  return {
    refreshSkills: (): void => {
      void controller.refreshSkills();
    },
    fetchCommandPreview: () => controller.fetchCommandPreview(),
    setSkillEnabled: async (name: string, enabled: boolean): Promise<boolean> => {
      const outcome = await controller.applySkillToggle(name, enabled);
      if (!outcome.ok && outcome.reason !== 'skill_not_found') {
        pushNotice(copy.settings.skillToggleFailed);
        return false;
      }
      if (outcome.ok && outcome.reopenFailures > 0) pushNotice(copy.settings.skillReopenFailed);
      return outcome.ok;
    },
    scanSkillCandidates: async (sourcePath?: string) => {
      const outcome = await controller.scanSkillCandidates(sourcePath);
      if (!outcome.ok) {
        pushNotice(copy.settings.skillScanFailed);
        return null;
      }
      return outcome.candidates;
    },
    importSkills: async (items: readonly SkillImportRequest[]): Promise<SkillImportSummary> => {
      const summary = await controller.importSkills(items);
      if (summary.reopenFailures > 0) pushNotice(copy.settings.skillReopenFailed);
      return summary;
    },
    removeSkill: async (name: string): Promise<boolean> => {
      const outcome = await controller.removeSkill(name);
      if (!outcome.ok) {
        pushNotice(copy.settings.skillDeleteFailed);
        return false;
      }
      if (outcome.ok && outcome.reopenFailures > 0) pushNotice(copy.settings.skillReopenFailed);
      return true;
    },
    refreshPlugins: (): void => {
      void controller.refreshPlugins();
    },
    setPluginEnabled: async (name: string, enabled: boolean): Promise<boolean> => {
      const outcome = await controller.applyPluginToggle(name, enabled);
      if (!outcome.ok) {
        pushNotice(copy.settings.pluginToggleFailed);
        return false;
      }
      if (outcome.ok && outcome.hotFailures > 0) pushNotice(copy.settings.pluginHotFailed);
      return true;
    },
    scanPluginCandidates: async (sourcePath?: string) => {
      const outcome = await controller.scanPluginCandidates(sourcePath);
      if (!outcome.ok) {
        pushNotice(copy.settings.skillScanFailed);
        return null;
      }
      return outcome.candidates;
    },
    importPlugins: async (items: readonly PluginImportRequest[]): Promise<PluginImportSummary> => {
      const summary = await controller.importPlugins(items);
      if (summary.reopenFailures > 0) pushNotice(copy.settings.pluginHotFailed);
      return summary;
    },
    removePlugin: async (name: string): Promise<boolean> => {
      const outcome = await controller.removePlugin(name);
      if (!outcome.ok) {
        pushNotice(copy.settings.skillDeleteFailed);
        return false;
      }
      if (outcome.ok && outcome.hotFailures > 0) pushNotice(copy.settings.pluginHotFailed);
      return true;
    },
    listPluginProposals: async () => {
      const outcome = await controller.listPluginProposals();
      if (!outcome.ok) return null;
      return outcome.proposals;
    },
    confirmPluginProposal: async (proposalId: string): Promise<boolean> => {
      const outcome = await controller.confirmPluginProposal(proposalId);
      if (!outcome.ok) {
        pushNotice(copy.settings.pluginToggleFailed);
        return false;
      }
      return true;
    },
    rejectPluginProposal: async (proposalId: string): Promise<boolean> => {
      const outcome = await controller.rejectPluginProposal(proposalId);
      if (!outcome.ok) {
        pushNotice(copy.settings.pluginToggleFailed);
        return false;
      }
      return true;
    },
  };
}
