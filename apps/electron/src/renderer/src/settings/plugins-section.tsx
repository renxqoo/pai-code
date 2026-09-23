/** 插件分区壳：搜索 + 导入入口 + 插件卡（来源/状态徽章 + 启停开关 + 移除）；
 *  关闭的插件在会话中不可用；导入对话框就地挂载（打开期扫描）。
 *  P2 审批语义：hint 文案明示「确认导入 = 授予全部平台能力」，对话框 risk 行同律。 */
import * as React from 'react';
import { Puzzle, RefreshCw, FolderInput } from 'lucide-react';

import type { PluginCandidateView, PluginView } from '@paiapp/contracts';
import { ActionButton, IconButton, ToggleSwitch } from '@paiapp/ui';

import { copy } from '@/strings';
import type { PluginImportRequest, PluginImportSummary } from '@/live/live-controller-types';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsSearchInput } from './settings-search-input';
import { PluginImportDialog } from './plugin-import-dialog';
import { PluginRemoveButton } from './plugin-remove-button';

type PluginsSectionProps = {
  list: readonly PluginView[]
  /** 启停（builtin 与 vendor 同语义：写 hub plugins.disabled + 活跃会话热生效编排）。 */
  onToggle: (name: string, enabled: boolean) => Promise<boolean>
  /** 进分区时拉取（合并视图：builtin + vendor + 装载态）。 */
  onRefresh: () => void
  /** 候选扫描（导入对话框数据源；null = 失败已通知）。 */
  onScanCandidates: (sourcePath?: string) => Promise<readonly PluginCandidateView[] | null>
  /** 批量导入（逐条隔离；汇总含逐条失败明细）。 */
  onImportPlugins: (items: readonly PluginImportRequest[]) => Promise<PluginImportSummary>
  /** 系统目录选择（对话框「选择文件夹…」）；null = 取消。 */
  onPickFolder: () => Promise<string | null>
  /** 移除 vendor 件（两步内联确认后调用；builtin 件不可移除）。 */
  onRemove: (name: string) => Promise<boolean>
}

/** 插件来源徽章文案（builtin = 词表内件；vendor = 第三方件）。 */
function pluginSourceLabel(source: PluginView['source']): string {
  return copy.settings.pluginSourceOptions[source];
}

/** 装载态徽章文案（active/failed/disabled/unloaded）。 */
function pluginStatusLabel(status: PluginView['status']): string {
  return copy.settings.pluginStatusOptions[status];
}

/** 本地过滤：名称/描述包含匹配（大小写不敏感）。 */
function pluginMatchesQuery(plugin: PluginView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  if (plugin.name.toLowerCase().includes(q)) return true;
  return (plugin.description ?? '').toLowerCase().includes(q);
}

function PluginsSection({ list, onToggle, onRefresh, onScanCandidates, onImportPlugins, onPickFolder, onRemove }: PluginsSectionProps) {
  const [query, setQuery] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<readonly PluginCandidateView[] | null>(null);
  const visible = list.filter((plugin) => pluginMatchesQuery(plugin, query));

  const scan = (sourcePath?: string): void => {
    setCandidates(null);
    void onScanCandidates(sourcePath).then((result) => setCandidates(result ?? []));
  };
  const openImport = (): void => {
    setImportOpen(true);
    scan(undefined);
  };
  const pickFolder = (): void => {
    void onPickFolder().then((path) => {
      if (path !== null) scan(path);
    });
  };

  return (
    <section>
      <SettingsPageHeader title={copy.settings.pluginsTitle} description={copy.settings.pluginsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center justify-end gap-[12px]">
          <SettingsSearchInput value={query} onChange={setQuery} placeholder={copy.settings.searchPlugins} className="w-[280px]" />
          <ActionButton variant="outline" onClick={openImport}>
            <FolderInput strokeWidth={1.75} className="size-[14px]" />
            {copy.settings.pluginsImportButton}
          </ActionButton>
          <IconButton label={copy.settings.pluginsRefresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        <p className="max-w-[640px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginsHint}</p>
        {list.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.pluginsEmpty}</p>
        ) : visible.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.searchNoResults}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {visible.map((plugin) => (
              <SettingsCard key={`${plugin.source}:${plugin.name}`} className="flex items-start gap-[14px] px-[16px] py-[14px] transition-colors hover:bg-accent/30">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Puzzle className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[8px]">
                    <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{plugin.name}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                      {pluginSourceLabel(plugin.source)}
                    </span>
                    {plugin.source === 'vendor' && plugin.origin !== null ? (
                      <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                        {copy.settings.pluginOriginOptions[plugin.origin]}
                      </span>
                    ) : null}
                    <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                      {pluginStatusLabel(plugin.status)}
                    </span>
                  </div>
                  {plugin.description !== null ? (
                    <p className="mt-[2px] truncate text-[12px] leading-[17px] text-muted-foreground">{plugin.description}</p>
                  ) : null}
                  {plugin.status !== 'active' && plugin.disabledReason !== null ? (
                    <p className="mt-[2px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginDisabledReason(plugin.disabledReason)}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-[8px]">
                  <ToggleSwitch
                    checked={plugin.enabled}
                    onCheckedChange={(next) => void onToggle(plugin.name, next)}
                    aria-label={copy.settings.pluginToggleLabel(plugin.name)}
                    className="mt-[2px]"
                  />
                  {plugin.source === 'vendor' ? <PluginRemoveButton name={plugin.name} onRemove={onRemove} /> : null}
                </div>
              </SettingsCard>
            ))}
          </div>
        )}
      </div>
      <PluginImportDialog
        open={importOpen}
        candidates={candidates}
        installedNames={list.map((plugin) => plugin.name)}
        onScan={scan}
        onPickFolder={pickFolder}
        onImport={onImportPlugins}
        onClose={() => setImportOpen(false)}
      />
    </section>
  );
}

export { PluginsSection };
