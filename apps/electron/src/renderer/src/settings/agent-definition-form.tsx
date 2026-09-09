import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import type { AgentDefinition } from '@paiapp/contracts';
import { isValidAgentName } from '@paiapp/contracts';
import { MenuButton, SegmentedControl, type SegmentedControlOption } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

import type { SettingsScreenProps } from './use-settings-screen';

type AgentsSettingsProps = SettingsScreenProps['agents'];

type AgentDefinitionFormProps = {
  /** 编辑态预填（null = 新建）；由外层 key 重建保证每次进入都是全新状态。 */
  initial: AgentDefinition | null
  /** upsert 的 previous（编辑态 = 被编辑条目的原键位；新建 = null）；键位 = 作用域 + 项目 + 文件名主干。 */
  previous: Parameters<AgentsSettingsProps['onSave']>[1]
  knownProjects: AgentsSettingsProps['knownProjects']
  modelOptions: AgentsSettingsProps['modelOptions']
  toolIds: AgentsSettingsProps['toolIds']
  onSave: AgentsSettingsProps['onSave']
  onCancel: () => void
};

const fieldClassName =
  'w-full rounded-lg border border-border bg-background px-3 text-[13px] leading-[18px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60';

const menuTriggerClassName =
  'flex h-9 w-full cursor-pointer items-center justify-between gap-[8px] rounded-lg border border-border bg-background px-3 text-left text-[13px] text-foreground outline-none select-none hover:border-foreground/30 aria-expanded:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

/** 模型下拉「继承父级」项的保留 id（双下划线前缀避免与真实模型名撞车）。 */
const MODEL_INHERIT_ID = '__inherit__';

/** 工具 chips 按词表顺序稳定输出（选中集合 → 提交数组）。 */
function orderedSelectedTools(toolIds: readonly string[], selected: ReadonlySet<string>): string[] {
  return toolIds.filter((id) => selected.has(id));
}

/** 字段标签行：主标签 + 可选弱化 hint（hint 文案单一真相在 strings）。 */
function fieldLabel(label: string, hint: string | undefined, htmlFor?: string): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
      {htmlFor === undefined ? (
        <span className="text-[13px] leading-[18px] font-medium text-foreground">{label}</span>
      ) : (
        <label htmlFor={htmlFor} className="text-[13px] leading-[18px] font-medium text-foreground">
          {label}
        </label>
      )}
      {hint === undefined ? null : <span className="min-w-0 text-[11px] leading-[15px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** 控件下方 hint 行（条件展示：模型继承/工具默认集/作用域差异）。 */
function fieldHint(text: string): React.ReactElement {
  return <p className="text-[11px] leading-[15px] text-muted-foreground">{text}</p>;
}

/**
 * 子 agent 定义表单（新建/编辑共用）：名称/描述/模型/工具（默认所有 | 自定义多选）/系统提示词/作用域。
 * 工具「默认所有」与 model 空选在提交时归一为 null（= 不写 frontmatter = hub 继承语义）；
 * 保存结果经 onSave 的 reason 反馈：null 成功回列表，'name_exists'/'invalid_name'/其余
 * 分别映射同名内联错误。
 */
function AgentDefinitionForm({ initial, previous, knownProjects, modelOptions, toolIds, onSave, onCancel }: AgentDefinitionFormProps) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [systemPrompt, setSystemPrompt] = React.useState(initial?.systemPrompt ?? '');
  const [model, setModel] = React.useState<string | null>(initial?.model ?? null);
  const [toolsMode, setToolsMode] = React.useState<'all' | 'custom'>(initial?.tools != null ? 'custom' : 'all');
  const [selectedTools, setSelectedTools] = React.useState<ReadonlySet<string>>(() => new Set(initial?.tools ?? []));
  const [scope, setScope] = React.useState<'user' | 'project'>(initial?.scope ?? 'user');
  const [project, setProject] = React.useState<string | null>(
    initial?.scope === 'project' && initial.project !== null ? initial.project : null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // 编辑态条目所在项目不在已知列表（目录不再活跃）时保留为可选项，避免改表单即丢项目
  const projectOptions = React.useMemo(() => {
    const current = initial?.scope === 'project' ? initial.project : null;
    if (current === null || knownProjects.includes(current)) return knownProjects;
    return [current, ...knownProjects];
  }, [initial, knownProjects]);

  const nameTrimmed = name.trim();
  // 名称非空但不符合词法 → 实时内联提示（提交时同样拦截）
  const nameInvalid = nameTrimmed.length > 0 && !isValidAgentName(nameTrimmed);

  const scopeOptions: readonly SegmentedControlOption<'user' | 'project'>[] = [
    { value: 'user', label: copy.settings.agentsScopeUser },
    // 无已知项目时不提供项目段（无落点的项目作用域是死路）
    ...(projectOptions.length > 0 ? [{ value: 'project' as const, label: copy.settings.agentsScopeProject }] : []),
  ];

  const toolsModeOptions: readonly SegmentedControlOption<'all' | 'custom'>[] = [
    { value: 'all', label: copy.settings.agentsToolsModeAll },
    { value: 'custom', label: copy.settings.agentsToolsModeCustom },
  ];

  const changeToolsMode = (next: 'all' | 'custom'): void => {
    setToolsMode(next);
  };

  const toggleTool = (id: string): void => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const changeScope = (next: 'user' | 'project'): void => {
    setScope(next);
    // 切到项目作用域时预选首个已知项目，杜绝「选了作用域但没选项目」死路
    if (next === 'project' && project === null) {
      const first = projectOptions[0];
      if (first !== undefined) setProject(first);
    }
  };

  const submit = async (): Promise<void> => {
    const nextName = name.trim();
    const nextDescription = description.trim();
    if (nextName.length === 0 || nextDescription.length === 0) {
      setError(copy.settings.agentsFormIncomplete);
      return;
    }
    if (!isValidAgentName(nextName)) {
      setError(copy.settings.agentsNameInvalid);
      return;
    }
    if (scope === 'project' && project === null) {
      setError(copy.settings.agentsFormIncomplete);
      return;
    }
    // 「默认所有」= null（不写 frontmatter tools，hub 用全部内置工具）；自定义须至少选一个
    const nextTools = toolsMode === 'all' ? null : orderedSelectedTools(toolIds, selectedTools);
    if (nextTools?.length === 0) {
      setError(copy.settings.agentsToolsPickEmpty);
      return;
    }
    const definition: AgentDefinition = {
      name: nextName,
      description: nextDescription,
      systemPrompt,
      tools: nextTools,
      model,
      scope,
      project: scope === 'user' ? null : project,
    };
    setSaving(true);
    setError(null);
    const reason = await onSave(definition, previous);
    setSaving(false);
    if (reason === null) {
      onCancel();
      return;
    }
    if (reason === 'name_exists') setError(copy.settings.agentsNameExists);
    else if (reason === 'invalid_name') setError(copy.settings.agentsNameInvalid);
    else setError(copy.settings.agentsSaveFailed);
  };

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex flex-col gap-[6px]">
        <nav className="flex items-center gap-[8px] text-[13px] leading-[18px]">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-[4px] text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.agentsTitle}
          </button>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ›
          </span>
          <span className="min-w-0 truncate font-medium text-foreground">{initial !== null ? initial.name : copy.settings.agentsNew}</span>
        </nav>
        <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-foreground">
          {initial !== null ? copy.settings.agentsFormTitleEdit : copy.settings.agentsFormTitleNew}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {initial !== null ? copy.settings.agentsFormSubtitleEdit : copy.settings.agentsFormSubtitleNew}
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-[20px] rounded-xl border border-border bg-card px-[24px] py-[22px]"
      >
        <div className="flex flex-col items-end gap-[6px]">
          <div className="flex items-center gap-[12px]">
            <span className="text-[13px] leading-[18px] font-medium text-foreground">{copy.settings.agentsFieldScope}</span>
            <SegmentedControl
              aria-label={copy.settings.agentsFieldScope}
              value={scope}
              onChange={changeScope}
              options={scopeOptions}
            />
          </div>
          <p className="text-right text-[11px] leading-[15px] text-muted-foreground">
            {scope === 'user' ? copy.settings.agentsScopeUserHint : copy.settings.agentsScopeProjectHint}
          </p>
          {scope === 'project' ? (
            <div className="w-[280px]">
              <MenuButton
                aria-label={copy.settings.agentsScopeProjectNone}
                align="end"
                popupMinWidth={280}
                items={projectOptions.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === project }))}
                onSelect={(value) => setProject(value)}
                triggerClassName={menuTriggerClassName}
                trigger={
                  <>
                    <span className={cn('min-w-0 flex-1 truncate', project === null && 'text-muted-foreground')}>
                      {project ?? copy.settings.agentsScopeProjectNone}
                    </span>
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
                  </>
                }
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-start gap-[16px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            {fieldLabel(copy.settings.agentsFieldName, copy.settings.agentsFieldNameHint, 'agent-definition-name')}
            <input
              id="agent-definition-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={nameInvalid}
              className={cn(fieldClassName, 'h-9', nameInvalid && 'border-destructive/60 focus:border-destructive/60')}
            />
            {nameInvalid ? <p className="text-[11px] leading-[15px] text-destructive">{copy.settings.agentsNameInvalid}</p> : null}
          </div>
          <div className="flex w-[260px] shrink-0 flex-col gap-[6px]">
            {fieldLabel(copy.settings.agentsFieldModel, undefined, undefined)}
            <MenuButton
              aria-label={copy.settings.agentsFieldModel}
              align="end"
              popupMinWidth={260}
              items={[
                { kind: 'item' as const, id: MODEL_INHERIT_ID, label: copy.settings.agentsModelInherit, selected: model === null },
                ...modelOptions.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === model })),
              ]}
              onSelect={(value) => setModel(value === MODEL_INHERIT_ID ? null : value)}
              triggerClassName={menuTriggerClassName}
              trigger={
                <>
                  <span className="min-w-0 flex-1 truncate">{model ?? copy.settings.agentsModelInherit}</span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
                </>
                }
              />
            {model === null ? fieldHint(copy.settings.agentsModelInheritHint) : null}
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          {fieldLabel(copy.settings.agentsFieldDescription, copy.settings.agentsFieldDescriptionHint, 'agent-definition-description')}
          <input
            id="agent-definition-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={cn(fieldClassName, 'h-9')}
          />
        </div>
        <div className="flex flex-col gap-[8px]">
          {fieldLabel(copy.settings.agentsFieldTools, copy.settings.agentsToolsAllHint, undefined)}
          <SegmentedControl
            value={toolsMode}
            onChange={changeToolsMode}
            options={toolsModeOptions}
            aria-label={copy.settings.agentsFieldTools}
          />
          {toolsMode === 'custom' ? (
            <div className="flex flex-wrap gap-[8px] pt-[2px]">
              {toolIds.map((id) => {
                const selected = selectedTools.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTool(id)}
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-[5px] font-mono text-[11.5px] leading-[16px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      selected
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {id}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-[6px]">
          {fieldLabel(copy.settings.agentsFieldPrompt, copy.settings.agentsFieldPromptHint, 'agent-definition-prompt')}
          <textarea
            id="agent-definition-prompt"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            className={cn(fieldClassName, 'min-h-[200px] resize-y py-[10px] font-mono text-[12.5px] leading-[20px]')}
          />
        </div>
        <div className="flex items-center justify-end gap-[12px]">
          {error !== null ? (
            <p className="mr-auto min-w-0 text-[12px] leading-[16px] text-destructive">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
          >
            {copy.settings.agentsSave}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-9 cursor-pointer rounded-lg px-3 text-[12.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
          >
            {copy.settings.agentsCancel}
          </button>
        </div>
      </form>
    </div>
  );
}

export { AgentDefinitionForm };
