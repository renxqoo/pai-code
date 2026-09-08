import * as React from 'react';
import { X } from 'lucide-react';

import type { PermissionRules } from '@paiapp/contracts';

import { copy } from '@/strings';

type PermissionsSectionProps = {
  rules: PermissionRules | null // null = 未加载（显示轻量加载态）
  onSave: (rules: PermissionRules) => Promise<boolean>
}

type ToolKey = 'bash' | 'write' | 'edit';
type PatternKind = 'allowPatterns' | 'blockPatterns';
type SaveStatus = 'saved' | 'failed' | null;

const TOOLS: readonly ToolKey[] = ['bash', 'write', 'edit'];
const PATTERN_KINDS: readonly PatternKind[] = ['allowPatterns', 'blockPatterns'];

const MODE_OPTIONS: ReadonlyArray<{ value: PermissionRules['mode']; label: string }> = [
  { value: 'ask', label: copy.settings.permissionsModeAsk },
  { value: 'allow-all', label: copy.settings.permissionsModeAllowAll },
  { value: 'block-all', label: copy.settings.permissionsModeBlockAll },
];

const TOOL_TITLES: Record<ToolKey, string> = {
  bash: copy.settings.permissionsBash,
  write: copy.settings.permissionsWrite,
  edit: copy.settings.permissionsEdit,
};

const KIND_LABELS: Record<PatternKind, string> = {
  allowPatterns: copy.settings.permissionsAllow,
  blockPatterns: copy.settings.permissionsBlock,
};

/** 深拷贝规则：保存时传给外层，避免草稿与已保存对象共享数组引用。 */
function cloneRules(rules: PermissionRules): PermissionRules {
  return {
    mode: rules.mode,
    bash: { allowPatterns: [...rules.bash.allowPatterns], blockPatterns: [...rules.bash.blockPatterns] },
    write: { allowPatterns: [...rules.write.allowPatterns], blockPatterns: [...rules.write.blockPatterns] },
    edit: { allowPatterns: [...rules.edit.allowPatterns], blockPatterns: [...rules.edit.blockPatterns] },
  };
}

function patternsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((pattern, index) => pattern === b[index]);
}

/** 深比较：草稿与初始规则完全一致时保存按钮禁用。 */
function rulesEqual(a: PermissionRules, b: PermissionRules): boolean {
  return (
    a.mode === b.mode &&
    TOOLS.every(
      (tool) => patternsEqual(a[tool].allowPatterns, b[tool].allowPatterns) && patternsEqual(a[tool].blockPatterns, b[tool].blockPatterns),
    )
  );
}

/** 逗号（半角/全角）或换行切分、trim、去空。 */
function parsePatterns(raw: string): string[] {
  return raw.split(/[,,\n]/).map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
}

/** 追加 pattern：保持去重与原顺序。 */
function appendPatterns(existing: readonly string[], raw: string): string[] {
  const next = [...existing];
  for (const pattern of parsePatterns(raw)) {
    if (!next.includes(pattern)) next.push(pattern);
  }
  return next;
}

/** pattern chips 编辑器（沿用 provider-form 模型 chips 的交互与样式）；纯渲染片段，输入草稿态由父层持有。 */
function patternEditor(config: {
  patterns: readonly string[]
  inputDraft: string
  onInputDraftChange: (value: string) => void
  onAppend: (raw: string) => void
  onRemove: (pattern: string) => void
}): React.ReactNode {
  return (
    <div className="flex min-h-[30px] flex-wrap items-center gap-[5px] rounded-[8px] border border-border bg-background px-[8px] py-[4px] outline-none focus-within:border-foreground/25">
      {config.patterns.map((pattern) => (
        <span
          key={pattern}
          className="flex items-center gap-[3px] rounded-[5px] border border-border bg-muted/40 py-[1px] pr-[3px] pl-[6px] font-mono text-[11px] leading-[15px] text-foreground"
        >
          {pattern}
          <button
            type="button"
            onClick={() => config.onRemove(pattern)}
            className="flex size-[14px] cursor-pointer items-center justify-center rounded-[3px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-[9px]" strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <input
        value={config.inputDraft}
        onChange={(e) => {
          const value = e.target.value;
          if (/[,，\n]/.test(value)) {
            config.onAppend(value);
            config.onInputDraftChange('');
          } else {
            config.onInputDraftChange(value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          if (config.inputDraft.trim().length === 0) return;
          e.preventDefault();
          config.onAppend(config.inputDraft);
          config.onInputDraftChange('');
        }}
        placeholder={config.patterns.length === 0 ? copy.settings.permissionsAddPattern : undefined}
        className="h-[20px] min-w-[120px] flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/** Permissions 分区：模式单选卡 + bash/write/edit 各自的 allow/block pattern chips + 保存（草稿未变时禁用）。 */
function PermissionsSection({ rules, onSave }: PermissionsSectionProps) {
  const [draft, setDraft] = React.useState<PermissionRules | null>(rules === null ? null : cloneRules(rules));
  const [inputDrafts, setInputDrafts] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<SaveStatus>(null);

  // 外部刷新 / 保存成功后 rules 引用变化 → 草稿与输入草稿同步为最新规则
  React.useEffect(() => {
    setDraft(rules === null ? null : cloneRules(rules));
    setInputDrafts({});
  }, [rules]);

  const setMode = (mode: PermissionRules['mode']): void => {
    setDraft((prev) => (prev === null ? prev : { ...prev, mode }));
  };

  const updatePatterns = (tool: ToolKey, kind: PatternKind, update: (patterns: string[]) => string[]): void => {
    setDraft((prev) => {
      if (prev === null) return prev;
      const group =
        kind === 'allowPatterns' ? { ...prev[tool], allowPatterns: update(prev[tool].allowPatterns) } : { ...prev[tool], blockPatterns: update(prev[tool].blockPatterns) };
      if (tool === 'bash') return { ...prev, bash: group };
      if (tool === 'write') return { ...prev, write: group };
      return { ...prev, edit: group };
    });
  };

  const submit = async (): Promise<void> => {
    if (draft === null || saving) return;
    setStatus(null);
    setSaving(true);
    const ok = await onSave(cloneRules(draft));
    setSaving(false);
    setStatus(ok ? 'saved' : 'failed');
  };

  if (rules === null || draft === null) {
    return (
      <section>
        <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {copy.settings.permissionsTitle}
        </p>
        <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.permissionsLoading}</p>
      </section>
    );
  }

  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {copy.settings.permissionsTitle}
      </p>
      <div className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <p className="text-[11.5px] text-muted-foreground">{copy.settings.permissionsMode}</p>
          <div className="flex items-center gap-[8px]">
            {MODE_OPTIONS.map((option) => {
              const selected = draft.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMode(option.value)}
                  className={`cursor-pointer rounded-[8px] border px-[12px] py-[6px] text-[12px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    selected
                      ? 'border-foreground/40 bg-muted/60 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-[16px] text-muted-foreground">{copy.settings.permissionsModeHint}</p>
          <p className="text-[11px] leading-[16px] text-muted-foreground">{copy.settings.permissionsGlobHint}</p>
        </div>
        {TOOLS.map((tool) => (
          <div key={tool} className="flex flex-col gap-[8px]">
            <p className="text-[11.5px] font-medium text-muted-foreground">{TOOL_TITLES[tool]}</p>
            <div className="grid grid-cols-2 gap-[10px]">
              {PATTERN_KINDS.map((kind) => {
                const listKey = `${tool}:${kind}`;
                return (
                  <div key={listKey} className="flex flex-col gap-[4px]">
                    <p className="text-[11px] text-muted-foreground">{KIND_LABELS[kind]}</p>
                    {patternEditor({
                      patterns: draft[tool][kind],
                      inputDraft: inputDrafts[listKey] ?? '',
                      onInputDraftChange: (value) => setInputDrafts((prev) => ({ ...prev, [listKey]: value })),
                      onAppend: (raw) => updatePatterns(tool, kind, (patterns) => appendPatterns(patterns, raw)),
                      onRemove: (pattern) => updatePatterns(tool, kind, (patterns) => patterns.filter((item) => item !== pattern)),
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || rulesEqual(draft, rules)}
            className="h-[30px] rounded-[8px] bg-foreground px-[14px] text-[12px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.settings.permissionsSave}
          </button>
          {status === 'saved' ? <p className="text-[11.5px] text-muted-foreground">{copy.settings.permissionsSaved}</p> : null}
          {status === 'failed' ? <p className="text-[11.5px] text-red-600">{copy.settings.permissionsSaveFailed}</p> : null}
        </div>
      </div>
    </section>
  );
}

export { PermissionsSection };
