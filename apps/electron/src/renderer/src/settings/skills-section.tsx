import * as React from 'react';
import { FolderInput, RefreshCw, Sparkles, Trash2 } from 'lucide-react';

import type { SkillCandidateView, SkillView } from '@paiapp/contracts';
import { ActionButton, IconButton, ToggleSwitch } from '@paiapp/ui';

import { copy } from '@/strings';
import type { SkillImportRequest, SkillImportSummary } from '@/live/live-controller-types';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsSearchInput } from './settings-search-input';
import { SkillImportDialog } from './skill-import-dialog';

type SkillsSectionProps = {
  list: readonly SkillView[]
  /** 启停：写 hub skills 名单后重开活跃会话生效。 */
  onToggle: (name: string, enabled: boolean) => Promise<boolean>
  /** 进分区时拉取（含禁用态全集，会话视角的 command/list 只见启用技能）。 */
  onRefresh: () => void
  /** 候选扫描（导入对话框数据源；null = 失败已通知）。 */
  onScanCandidates: (sourcePath?: string) => Promise<readonly SkillCandidateView[] | null>
  /** 批量导入（逐条隔离；汇总含逐条失败明细）。 */
  onImportSkills: (items: readonly SkillImportRequest[]) => Promise<SkillImportSummary>
  /** 系统目录选择（对话框「选择文件夹…」）；null = 取消。 */
  onPickFolder: () => Promise<string | null>
  /** 删除用户级技能（两步内联确认后调用；hub 删整技能目录）。 */
  onRemove: (name: string) => Promise<boolean>
}

/** 技能来源展示文案（builtin = hub 随包内置；user = ~/.x-harness/skills；project = 项目内）。 */
function skillSourceLabel(source: SkillView['source']): string {
  return copy.settings.skillSourceOptions[source];
}

/** 本地过滤：技能名称包含匹配（大小写不敏感；目录无描述面）。 */
function skillMatchesQuery(skill: SkillView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return skill.name.toLowerCase().includes(q);
}

/** 技能行删除（两步内联确认范式：先点删除，再确认/取消——provider-row 同款）。 */
function SkillRemoveButton({ name, onRemove }: { name: string; onRemove: (name: string) => Promise<boolean> }): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <span className="flex items-center gap-[6px]">
        <span className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.skillDeleteConfirm(name)}</span>
        <ActionButton size="sm" variant="outline" onClick={() => { setConfirming(false); void onRemove(name); }}>
          {copy.settings.confirmRemove}
        </ActionButton>
        <ActionButton size="sm" variant="quiet" onClick={() => setConfirming(false)}>
          {copy.settings.cancelEdit}
        </ActionButton>
      </span>
    );
  }
  return (
    <IconButton label={copy.settings.skillDeleteLabel(name)} onClick={() => setConfirming(true)}>
      <Trash2 strokeWidth={1.75} />
    </IconButton>
  );
}

/** Skills 分区：搜索 + 导入入口 + 用户级技能卡（来源徽章 + 关闭徽章 + 启停开关 + 删除）；
 *  关闭的技能在会话中不可用；导入对话框就地挂载（打开期扫描）。 */
function SkillsSection({ list, onToggle, onRefresh, onScanCandidates, onImportSkills, onPickFolder, onRemove }: SkillsSectionProps) {
  const [query, setQuery] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<readonly SkillCandidateView[] | null>(null);
  const visibleSkills = list.filter((skill) => skillMatchesQuery(skill, query));

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
      <SettingsPageHeader title={copy.settings.skillsTitle} description={copy.settings.skillsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center justify-end gap-[12px]">
          <SettingsSearchInput value={query} onChange={setQuery} placeholder={copy.settings.searchSkills} className="w-[280px]" />
          <ActionButton variant="outline" onClick={openImport}>
            <FolderInput strokeWidth={1.75} className="size-[14px]" />
            {copy.settings.skillsImportButton}
          </ActionButton>
          <IconButton label={copy.settings.skillsRefresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        <p className="max-w-[640px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.skillsHint}</p>
        {list.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.skillsEmpty}</p>
        ) : visibleSkills.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.searchNoResults}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {visibleSkills.map((skill) => (
              <SettingsCard key={`${skill.source}:${skill.name}`} className="flex items-start gap-[14px] px-[16px] py-[14px] transition-colors hover:bg-accent/30">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Sparkles className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[8px]">
                    <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{skill.name}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                      {skillSourceLabel(skill.source)}
                    </span>
                    {skill.enabled ? null : (
                      <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">
                        {copy.settings.skillDisabledHint}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-[8px]">
                  <ToggleSwitch
                    checked={skill.enabled}
                    onCheckedChange={(next) => void onToggle(skill.name, next)}
                    aria-label={`${copy.settings.skillToggleLabel(skill.name)}`}
                    className="mt-[2px]"
                  />
                  <SkillRemoveButton name={skill.name} onRemove={onRemove} />
                </div>
              </SettingsCard>
            ))}
          </div>
        )}
      </div>
      <SkillImportDialog
        open={importOpen}
        candidates={candidates}
        installedNames={list.map((skill) => skill.name)}
        onScan={scan}
        onPickFolder={pickFolder}
        onImport={onImportSkills}
        onClose={() => setImportOpen(false)}
      />
    </section>
  );
}

export { SkillsSection };
