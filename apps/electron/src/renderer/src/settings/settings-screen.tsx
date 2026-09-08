import * as React from 'react';

import { copy } from '@/strings';
import { HistorySection } from './history-section';
import { KeysSection } from './keys-section';
import { PermissionsSection } from './permissions-section';
import { ProvidersSection } from './providers-section';
import { SettingsSectionNav } from './settings-section-nav';
import type { CredentialView, PermissionRules, ProviderConfigView } from '@paiapp/contracts';

type SettingsScreenProps = {
  open: boolean
  providers: readonly ProviderConfigView[]
  credentials: readonly CredentialView[]
  defaultModel: string | null
  modelOptions: readonly string[]
  permissionRules: PermissionRules | null
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>
  onClose: () => void
  onUpsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>
  onRemoveProvider: (name: string) => Promise<boolean>
  onSelectDefaultModel: (value: string | null) => void
  onTestProvider: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>
  onSavePermissionRules: (rules: PermissionRules) => Promise<boolean>
  /** 进入权限分区时拉取规则（hub 文件面无推送，打开即读） */
  onShowPermissions: () => void
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
  saved,
  onClose,
  onUpsertProvider,
  onRemoveProvider,
  onSelectDefaultModel,
  onTestProvider,
  onSavePermissionRules,
  onShowPermissions,
  onOpenSaved,
  onRefreshSaved,
  onSaveKey,
  onRemoveKey,
  onRefreshKeys,
}: SettingsScreenProps) {
  const [section, setSection] = React.useState<'providers' | 'keys' | 'permissions' | 'history'>('providers');
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
                <PermissionsSection rules={permissionRules} onSave={onSavePermissionRules} />
              ) : (
                <HistorySection saved={saved} onOpenSaved={onOpenSaved} onRefreshSaved={onRefreshSaved} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SettingsScreen };
