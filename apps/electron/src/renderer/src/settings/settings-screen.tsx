import * as React from 'react';

import { copy } from '@/strings';
import { AgentsSection } from './agents-section';
import { HistorySection } from './history-section';
import { KeysSection } from './keys-section';
import { PermissionsSection } from './permissions-section';
import { ProvidersSection } from './providers-section';
import { SettingsSectionNav } from './settings-section-nav';
import { SkillsSection } from './skills-section';
import type { AgentView, CredentialView, PermissionRules, ProviderConfigView } from '@paiapp/contracts';

type SettingsScreenProps = {
  open: boolean
  providers: readonly ProviderConfigView[]
  credentials: readonly CredentialView[]
  defaultModel: string | null
  modelOptions: readonly string[]
  permissionRules: PermissionRules | null
  agents: readonly AgentView[]
  skills: ReadonlyArray<{ name: string; description: string | null }>
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>
  pinnedSessions: ReadonlySet<string>
  savedProjects: readonly string[]
  onTogglePin: (sessionPath: string) => void
  onRevealSession: (sessionPath: string) => void
  onClose: () => void
  onUpsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>
  onRemoveProvider: (name: string) => Promise<boolean>
  onSelectDefaultModel: (value: string | null) => void
  onTestProvider: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>
  onSavePermissionRules: (rules: PermissionRules) => Promise<boolean>
  /** 进入权限分区时拉取规则（hub 文件面无推送，打开即读） */
  onShowPermissions: () => void
  sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null
  onSaveSessionRules: (rules: PermissionRules | null) => Promise<boolean>
  onLoadSessionRules: () => void
  /** 进入 Agents 分区时拉取（host 级枚举无推送） */
  onShowAgents: () => void
  onOpenSaved: (sessionPath: string) => void
  onRefreshSaved: () => void
  onSaveKey: (provider: string, apiKey: string) => Promise<boolean>
  onRemoveKey: (provider: string) => Promise<boolean>
  onRefreshKeys: () => void
}

/**
 * 设置页容器：不透明全屏 overlay，左 nav + 右内容两栏。
 * 关闭走右上按钮；Esc 由父层全局监听，本组件不挂键盘事件。
 */
function SettingsScreen({
  open,
  providers,
  credentials,
  defaultModel,
  modelOptions,
  permissionRules,
  agents,
  skills,
  saved,
  pinnedSessions,
  savedProjects,
  onTogglePin,
  onRevealSession,
  onClose,
  onUpsertProvider,
  onRemoveProvider,
  onSelectDefaultModel,
  onTestProvider,
  onSavePermissionRules,
  onShowPermissions,
  sessionRules,
  onSaveSessionRules,
  onLoadSessionRules,
  onShowAgents,
  onOpenSaved,
  onRefreshSaved,
  onSaveKey,
  onRemoveKey,
  onRefreshKeys,
}: SettingsScreenProps) {
  const [section, setSection] = React.useState<'providers' | 'keys' | 'permissions' | 'agents' | 'skills' | 'history'>('providers');
  // 每次打开回到首分区：重进分区会重触发 onShow*（权限/agents 目录无推送，按开即读）
  React.useEffect(() => {
    if (open) setSection('providers');
  }, [open]);
  if (!open) return null;
  const navItems = [
    { id: 'providers', label: copy.settings.providersTitle, selected: section === 'providers', onSelect: () => setSection('providers') },
    { id: 'keys', label: copy.settings.keysTitle, selected: section === 'keys', onSelect: () => setSection('keys') },
    {
      id: 'permissions',
      label: copy.settings.permissionsTitle,
      selected: section === 'permissions',
      onSelect: () => {
        onShowPermissions();
        setSection('permissions');
      },
    },
    {
      id: 'agents',
      label: copy.settings.agentsTitle,
      selected: section === 'agents',
      onSelect: () => {
        onShowAgents();
        setSection('agents');
      },
    },
    { id: 'skills', label: copy.settings.skillsTitle, selected: section === 'skills', onSelect: () => setSection('skills') },
    { id: 'history', label: copy.settings.historyTitle, selected: section === 'history', onSelect: () => setSection('history') },
  ];
  return (
    <div className="fixed inset-0 z-40 bg-background">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-[22px] py-[18px]">
          <p className="text-[13.5px] font-medium">{copy.settings.title}</p>
          <button type="button" onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground">
            {copy.settings.close}
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-[200px] shrink-0 border-r border-border">
            <SettingsSectionNav ariaLabel={copy.settings.title} items={navItems} />
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[720px] px-[28px] pb-[32px]">
              {section === 'providers' ? (
                <ProvidersSection
                  providers={providers}
                  defaultModel={defaultModel}
                  modelOptions={modelOptions}
                  onUpsertProvider={onUpsertProvider}
                  onRemoveProvider={onRemoveProvider}
                  onSelectDefaultModel={onSelectDefaultModel}
                  onTestProvider={onTestProvider}
                />
              ) : section === 'keys' ? (
                <KeysSection credentials={credentials} onSaveKey={onSaveKey} onRemoveKey={onRemoveKey} onRefresh={onRefreshKeys} />
              ) : section === 'permissions' ? (
                <PermissionsSection
                  rules={permissionRules}
                  onSave={onSavePermissionRules}
                  sessionRules={sessionRules}
                  onLoadSession={onLoadSessionRules}
                  onSaveSession={onSaveSessionRules}
                />
              ) : section === 'agents' ? (
                <AgentsSection agents={agents} onRefresh={onShowAgents} />
              ) : section === 'skills' ? (
                <SkillsSection skills={skills} />
              ) : (
                <HistorySection
                  saved={saved}
                  pinned={pinnedSessions}
                  projects={savedProjects}
                  onTogglePin={onTogglePin}
                  onReveal={onRevealSession}
                  onOpenSaved={onOpenSaved}
                  onRefreshSaved={onRefreshSaved}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SettingsScreen };
