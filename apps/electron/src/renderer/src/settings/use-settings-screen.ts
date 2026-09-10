import * as React from 'react';

import type { AgentDefinition, PermissionRules, ProviderConfigView, ProviderModel, SkillView, ThinkingFormat } from '@paiapp/contracts';
import { AGENT_TOOL_IDS } from '@paiapp/contracts';
import type { Theme } from '@/components/theme-context';
import { useTheme } from '@/components/use-theme';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import type { WorkspaceActions, WorkspaceDiagnostics } from '@/live/workspace-actions';
import { changeLocaleSetting, getLocaleSetting, type LocaleSetting } from '@/strings';
import { FETCH_ON_ENTER_SECTIONS, SETTINGS_FIRST_SECTION, type SettingsSectionId } from './settings-sections';

type SavedSession = { sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number };

/**
 * 按开即读派发：分区目录/文件面无推送，每次进入都拉取；其余分区 no-op。
 * 分区 ↔ 动作映射在这里集中（导航层不认识 workspace 动作面）。
 */
export function dispatchSectionEnter(id: SettingsSectionId, actions: Pick<WorkspaceActions, 'refreshPermissionRules' | 'refreshAgentDefinitions' | 'refreshSkills' | 'fetchDiagnostics'>): void {
  if (!FETCH_ON_ENTER_SECTIONS.has(id)) return;
  if (id === 'permissions') actions.refreshPermissionRules();
  else if (id === 'agents') actions.refreshAgentDefinitions();
  else if (id === 'skills') actions.refreshSkills();
  else actions.fetchDiagnostics();
}

/** 已保存会话的项目目录（首现顺序去重；历史分区过滤数据源）。 */
export function savedProjectsOf(saved: readonly SavedSession[]): string[] {
  return [...new Set(saved.map((session) => session.cwd))];
}

/** 置顶键集合（sessionPath）：与侧栏置顶区共用 preferences.pinnedSessions 真相。 */
export function pinnedSetOf(pinnedSessions: readonly string[]): ReadonlySet<string> {
  return new Set(pinnedSessions);
}

export type SettingsScreenProps = {
  open: boolean;
  onClose: () => void;
  section: SettingsSectionId;
  onSelectSection: (id: SettingsSectionId) => void;
  general: {
    localeSetting: LocaleSetting;
    onLocaleSettingChange: (next: LocaleSetting) => void;
    theme: Theme;
    onThemeChange: (next: Theme) => void;
    trustedDefault: boolean;
    onSaveTrustedDefault: (trustedDefault: boolean) => Promise<boolean>;
    onRestartOnboarding: () => void;
  };
  providers: {
    list: readonly ProviderConfigView[];
    defaultModel: string | null;
    modelOptions: readonly string[];
    onUpsert: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat: ThinkingFormat; apiKey?: string }) => Promise<boolean>;
    onRemove: (name: string) => Promise<boolean>;
    onSelectDefaultModel: (value: string | null) => void;
    onTest: (name: string, modelId?: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  };
  permissions: {
    rules: PermissionRules | null;
    onSave: (rules: PermissionRules) => Promise<boolean>;
    sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null;
    onLoadSession: () => void;
    onSaveSession: (rules: PermissionRules | null) => Promise<boolean>;
  };
  /** 子 agent 定义键位（作用域 + 项目 + 文件名主干）；upsert 的 previous 与 remove 共用。 */
  agents: {
    definitions: readonly AgentDefinition[];
    /** 可指定为 project 作用域的项目目录（已保存会话 cwd 去重）。 */
    knownProjects: readonly string[];
    modelOptions: readonly string[];
    /** 可选工具 id 词表（contracts 单一真相的副本）。 */
    toolIds: readonly string[];
    onRefresh: () => void;
    onSave: (
      definition: AgentDefinition,
      previous: { file: string; scope: 'user' | 'project'; project: string | null } | null,
    ) => Promise<string | null>;
    onRemove: (key: { file: string; scope: 'user' | 'project'; project: string | null }) => Promise<string | null>;
  };
  skills: { list: readonly SkillView[]; onToggle: (name: string, enabled: boolean) => Promise<boolean>; onRefresh: () => void };
  history: {
    saved: readonly SavedSession[];
    pinned: ReadonlySet<string>;
    projects: readonly string[];
    onTogglePin: (sessionPath: string) => void;
    onReveal: (sessionPath: string) => void;
    onOpenSaved: (sessionPath: string) => void;
    onRefresh: () => void;
  };
  diagnostics: { data: WorkspaceDiagnostics | null; onRefresh: () => void; onRestartHost: () => void };
};

export type UseSettingsScreenInput = {
  workspace: LiveWorkspaceView;
  open: boolean;
  onClose: () => void;
  /** 打开时进入的分区（命令面板跳转；缺省回首分区）。 */
  initialSection?: SettingsSectionId;
};

/**
 * 设置页装配 hook：从 live 工作区派生 SettingsScreen 全部 props（数据/动作/分区状态/
 * 语言/主题/重跑引导），workspace-main 只剩一行接线。语言切换经 changeLocaleSetting
 * 广播（app 根重挂载后本 hook 状态回到首分区，与既有行为一致）。
 */
export function useSettingsScreen({ workspace, open, onClose, initialSection }: UseSettingsScreenInput): SettingsScreenProps {
  const [section, setSection] = React.useState<SettingsSectionId>(initialSection ?? SETTINGS_FIRST_SECTION);
  const [localeSetting, setLocaleSettingState] = React.useState<LocaleSetting>(getLocaleSetting());
  const { theme, setTheme } = useTheme();
  const { actions } = workspace;
  // 每次打开回到首分区（重进分区会重触发按开即读）
  React.useEffect(() => {
    if (open) setSection(initialSection ?? SETTINGS_FIRST_SECTION);
  }, [open]);

  const onSelectSection = React.useCallback((id: SettingsSectionId) => {
    dispatchSectionEnter(id, actions);
    setSection(id);
  }, [actions]);

  const pinned = React.useMemo(() => pinnedSetOf(workspace.preferences.pinnedSessions), [workspace.preferences.pinnedSessions]);
  const projects = React.useMemo(() => savedProjectsOf(workspace.saved), [workspace.saved]);

  return React.useMemo<SettingsScreenProps>(() => ({
    open,
    onClose,
    section,
    onSelectSection,
    general: {
      localeSetting,
      onLocaleSettingChange: (next) => {
        changeLocaleSetting(next);
        setLocaleSettingState(getLocaleSetting());
      },
      theme,
      onThemeChange: setTheme,
      trustedDefault: workspace.preferences.trustedDefault,
      onSaveTrustedDefault: (trustedDefault) => actions.saveGeneralPreferences({ trustedDefault }),
      onRestartOnboarding: () => {
        void actions.restartOnboarding().then((ok) => {
          if (ok) onClose();
        });
      },
    },
    providers: {
      list: workspace.providers,
      defaultModel: workspace.preferences.defaultModel,
      modelOptions: workspace.composer.modelOptions,
      onUpsert: actions.upsertProvider,
      onRemove: actions.removeProvider,
      onSelectDefaultModel: actions.setDefaultModel,
      onTest: actions.testProvider,
    },
    permissions: {
      rules: workspace.permissionRules,
      onSave: actions.writePermissionRules,
      sessionRules: workspace.sessionRules,
      onLoadSession: actions.readSessionRules,
      onSaveSession: actions.writeSessionRules,
    },
    agents: {
      definitions: workspace.agentDefinitions,
      knownProjects: projects,
      modelOptions: workspace.composer.modelOptions,
      toolIds: [...AGENT_TOOL_IDS],
      onRefresh: actions.refreshAgentDefinitions,
      onSave: (definition, previous) => actions.upsertAgentDefinition(definition, previous),
      onRemove: (key) => actions.removeAgentDefinition(key),
    },
    skills: { list: workspace.skills, onToggle: actions.setSkillEnabled, onRefresh: actions.refreshSkills },
    history: {
      saved: workspace.saved,
      pinned,
      projects,
      onTogglePin: actions.togglePinnedSession,
      onReveal: actions.revealSession,
      onOpenSaved: (sessionPath) => {
        void actions.openSavedSession(sessionPath);
        onClose();
      },
      onRefresh: actions.refreshSaved,
    },
    diagnostics: { data: workspace.diagnostics, onRefresh: actions.fetchDiagnostics, onRestartHost: actions.restartHost },
  }), [open, onClose, section, onSelectSection, localeSetting, theme, setTheme, workspace, pinned, projects, actions]);
}
