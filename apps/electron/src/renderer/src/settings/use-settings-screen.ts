import * as React from 'react';

import type { AgentView, CredentialView, PermissionRules, ProviderConfigView, ProviderModel, SkillView, ThinkingFormat } from '@paiapp/contracts';
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
export function dispatchSectionEnter(id: SettingsSectionId, actions: Pick<WorkspaceActions, 'refreshPermissionRules' | 'refreshAgents' | 'refreshSkills' | 'fetchDiagnostics'>): void {
  if (!FETCH_ON_ENTER_SECTIONS.has(id)) return;
  if (id === 'permissions') actions.refreshPermissionRules();
  else if (id === 'agents') actions.refreshAgents();
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
    onTest: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  };
  keys: {
    credentials: readonly CredentialView[];
    onSave: (provider: string, apiKey: string) => Promise<boolean>;
    onRemove: (provider: string) => Promise<boolean>;
    onRefresh: () => void;
  };
  permissions: {
    rules: PermissionRules | null;
    onSave: (rules: PermissionRules) => Promise<boolean>;
    sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null;
    onLoadSession: () => void;
    onSaveSession: (rules: PermissionRules | null) => Promise<boolean>;
  };
  agents: { list: readonly AgentView[]; onRefresh: () => void };
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
};

/**
 * 设置页装配 hook：从 live 工作区派生 SettingsScreen 全部 props（数据/动作/分区状态/
 * 语言/主题/重跑引导），workspace-main 只剩一行接线。语言切换经 changeLocaleSetting
 * 广播（app 根重挂载后本 hook 状态回到首分区，与既有行为一致）。
 */
export function useSettingsScreen({ workspace, open, onClose }: UseSettingsScreenInput): SettingsScreenProps {
  const [section, setSection] = React.useState<SettingsSectionId>(SETTINGS_FIRST_SECTION);
  const [localeSetting, setLocaleSettingState] = React.useState<LocaleSetting>(getLocaleSetting());
  const { theme, setTheme } = useTheme();
  const { actions } = workspace;
  // 每次打开回到首分区（重进分区会重触发按开即读）
  React.useEffect(() => {
    if (open) setSection(SETTINGS_FIRST_SECTION);
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
    keys: {
      credentials: workspace.credentials,
      onSave: actions.setProviderKey,
      onRemove: actions.removeProviderKey,
      onRefresh: actions.refreshCredentials,
    },
    permissions: {
      rules: workspace.permissionRules,
      onSave: actions.writePermissionRules,
      sessionRules: workspace.sessionRules,
      onLoadSession: actions.readSessionRules,
      onSaveSession: actions.writeSessionRules,
    },
    agents: { list: workspace.agents, onRefresh: actions.refreshAgents },
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
