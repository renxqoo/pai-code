import * as React from 'react';
import { Bot, Plus, RefreshCw, Trash2, X } from 'lucide-react';

import type { AgentDefinition } from '@paiapp/contracts';
import { IconButton } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

import { AgentDefinitionForm } from './agent-definition-form';
import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsSearchInput } from './settings-search-input';
import type { SettingsScreenProps } from './use-settings-screen';

type AgentsSectionProps = SettingsScreenProps['agents'];

/** 定义条目的唯一键（作用域 + 项目 + 文件名主干；upsert previous 与 remove 共用同一键位）。 */
type AgentKey = { file: string; scope: 'user' | 'project'; project: string | null };

type AgentsView = { kind: 'list' } | { kind: 'form'; initial: AgentDefinition | null; previous: AgentKey | null };

/** 卡片确认删除态的稳定字符串键（scope:project:file）。 */
function agentKeyString(key: AgentKey): string {
  return `${key.scope}:${key.project ?? ''}:${key.file}`;
}

function definitionKey(definition: AgentDefinition): AgentKey {
  return { file: definition.file ?? definition.name, scope: definition.scope, project: definition.project };
}

/** 本地过滤：名称/描述包含匹配（大小写不敏感）。 */
function agentMatchesQuery(definition: AgentDefinition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return definition.name.toLowerCase().includes(q) || definition.description.toLowerCase().includes(q);
}

/** 定义卡 meta 行：模型（未指定 = 继承父级）· 工具数（未指定 = 默认工具集）。 */
function agentMetaText(definition: AgentDefinition): string {
  const model = definition.model ?? copy.settings.agentsModelInherit;
  const tools = definition.tools === null ? copy.settings.agentsToolsDefault : copy.settings.agentsTools(definition.tools.length);
  return `${model} · ${tools}`;
}

/** 作用域徽章：项目级描边加重（提示仅受信会话可见）。 */
function scopeBadgeClassName(scope: AgentDefinition['scope']): string {
  return scope === 'project'
    ? 'shrink-0 rounded-full border border-foreground/50 px-2 py-[1px] text-[11px] leading-[16px] text-foreground'
    : 'shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground';
}

/** 卡片行尾按钮通用态（编辑 / 确认删除 / 取消）。 */
const cardActionClassName =
  'h-8 cursor-pointer rounded-lg px-[10px] text-[12.5px] leading-none outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** Agents 分区：列表态（搜索 + 作用域分组卡 + 新建/编辑/两步删除）↔ 表单态（新建/编辑共用）。 */
function AgentsSection({ definitions, knownProjects, modelOptions, toolIds, onRefresh, onSave, onRemove }: AgentsSectionProps) {
  const [view, setView] = React.useState<AgentsView>({ kind: 'list' });
  const [query, setQuery] = React.useState('');
  /** 处于「确认删除」态的卡片键；其余卡片不展示确认行。 */
  const [confirmingKey, setConfirmingKey] = React.useState<string | null>(null);
  const [removeFailed, setRemoveFailed] = React.useState(false);

  const openCreate = (): void => {
    setConfirmingKey(null);
    setView({ kind: 'form', initial: null, previous: null });
  };

  const openEdit = (definition: AgentDefinition): void => {
    setConfirmingKey(null);
    setView({ kind: 'form', initial: definition, previous: definitionKey(definition) });
  };

  const backToList = (): void => {
    setConfirmingKey(null);
    setView({ kind: 'list' });
  };

  const askRemove = (key: AgentKey): void => {
    setRemoveFailed(false);
    setConfirmingKey(agentKeyString(key));
  };

  const confirmRemove = (key: AgentKey): void => {
    void onRemove(key).then((reason) => {
      if (reason === null) {
        setConfirmingKey(null);
        setRemoveFailed(false);
        return;
      }
      setRemoveFailed(true);
    });
  };

  if (view.kind === 'form') {
    return (
      <section>
        <AgentDefinitionForm
          key={view.previous === null ? 'new' : agentKeyString(view.previous)}
          initial={view.initial}
          previous={view.previous}
          knownProjects={knownProjects}
          modelOptions={modelOptions}
          toolIds={toolIds}
          onSave={onSave}
          onCancel={backToList}
        />
      </section>
    );
  }

  const visible = definitions.filter((definition) => agentMatchesQuery(definition, query));
  const userAgents = visible.filter((definition) => definition.scope === 'user');
  const projectAgents = visible.filter((definition) => definition.scope === 'project');
  const groups = [
    { id: 'user', title: copy.settings.agentsGroupUser, items: userAgents },
    { id: 'project', title: copy.settings.agentsGroupProject, items: projectAgents },
  ] as const;

  return (
    <section>
      <SettingsPageHeader title={copy.settings.agentsTitle} description={copy.settings.agentsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center gap-[12px]">
          <span className="mr-auto text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.agentsCount(definitions.length)}</span>
          <SettingsSearchInput value={query} onChange={setQuery} placeholder={copy.settings.agentsSearch} className="w-[240px]" />
          <IconButton label={copy.settings.refresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
          <button
            type="button"
            onClick={openCreate}
            className="flex h-8 cursor-pointer items-center gap-[6px] rounded-lg bg-foreground px-3 text-[12.5px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-[14px]" strokeWidth={2} />
            {copy.settings.agentsNew}
          </button>
        </div>
        {removeFailed ? <p className="text-[12px] leading-[16px] text-destructive">{copy.settings.agentsRemoveFailed}</p> : null}
        {definitions.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.agentsEmpty}</p>
        ) : visible.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.searchNoResults}</p>
        ) : (
          groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.id} className="flex flex-col gap-[8px]">
                <div className="flex items-baseline gap-[8px]">
                  <p className="text-[13px] leading-[18px] font-medium text-foreground">{group.title}</p>
                  <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.agentsCount(group.items.length)}</p>
                </div>
                <div className="flex flex-col gap-[12px]">
                  {group.items.map((definition) => {
                    const key = definitionKey(definition);
                    const confirming = confirmingKey === agentKeyString(key);
                    return (
                      <SettingsCard
                        key={agentKeyString(key)}
                        className="flex items-start gap-[14px] px-[16px] py-[14px] transition-colors hover:bg-accent/30"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                        >
                          <Bot className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-[8px]">
                            <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{definition.name}</p>
                            <span className={scopeBadgeClassName(definition.scope)}>
                              {definition.scope === 'project' ? copy.settings.agentsProjectBadge : copy.settings.agentsUserBadge}
                            </span>
                          </div>
                          {definition.description.length > 0 ? (
                            <p className="mt-[2px] line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">{definition.description}</p>
                          ) : null}
                          <p className="mt-[2px] truncate text-[11.5px] leading-[16px] text-muted-foreground/80">{agentMetaText(definition)}</p>
                          {definition.scope === 'project' && definition.project !== null ? (
                            <p className="mt-[2px] truncate font-mono text-[11.5px] leading-[16px] text-muted-foreground/80">{definition.project}</p>
                          ) : null}
                          {confirming ? (
                            <p className="mt-[4px] text-[11.5px] leading-[16px] text-destructive">{copy.settings.agentsRemoveHint(definition.file ?? definition.name)}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-[4px]">
                          {confirming ? (
                            <>
                              <button
                                type="button"
                                onClick={() => confirmRemove(key)}
                                className={cn(cardActionClassName, 'font-medium text-destructive hover:bg-destructive/10')}
                              >
                                {copy.settings.agentsConfirmRemove}
                              </button>
                              <IconButton label={copy.settings.agentsCancel} onClick={() => setConfirmingKey(null)}>
                                <X strokeWidth={1.75} />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(definition)}
                                className={cn(cardActionClassName, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                              >
                                {copy.settings.agentsEditAction}
                              </button>
                              <IconButton label={copy.settings.agentsRemoveAction} onClick={() => askRemove(key)}>
                                <Trash2 strokeWidth={1.75} />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </SettingsCard>
                    );
                  })}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}

export { AgentsSection };
