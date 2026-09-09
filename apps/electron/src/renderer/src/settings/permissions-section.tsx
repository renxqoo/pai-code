import * as React from 'react';
import { X } from 'lucide-react';

import { clonePermissionRules, defaultPermissionRules, type PermissionRules } from '@paiapp/contracts';
import { SegmentedControl } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

type PermissionsSectionProps = {
  rules: PermissionRules | null // null = 未加载（显示轻量加载态）
  onSave: (rules: PermissionRules) => Promise<boolean>
  /** 会话级规则（sidecar）：source=thread 表示当前会话存在独立规则。 */
  sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null
  onLoadSession: () => void
  /** null = 删除 sidecar 回退全局。 */
  onSaveSession: (rules: PermissionRules | null) => Promise<boolean>
}

type ToolKey = 'bash' | 'write' | 'edit';
type PatternKind = 'allowPatterns' | 'blockPatterns';
type SaveStatus = 'saved' | 'failed' | null;

const TOOLS: readonly ToolKey[] = ['bash', 'write', 'edit'];

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

/** pattern chips 编辑器（与 provider-form 模型 chips 同交互同观感）；纯渲染片段，输入草稿态由父层持有。 */
function patternEditor(config: {
  patterns: readonly string[]
  inputDraft: string
  onInputDraftChange: (value: string) => void
  onAppend: (raw: string) => void
  onRemove: (pattern: string) => void
}): React.ReactNode {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-[5px] rounded-lg border border-border bg-background px-[10px] py-[5px] outline-none focus-within:border-foreground/30">
      {config.patterns.map((pattern) => (
        <span
          key={pattern}
          className="flex items-center gap-[3px] rounded-md border border-border bg-muted/40 py-[1px] pr-[3px] pl-[7px] font-mono text-[11px] leading-[16px] text-foreground"
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
        aria-label={copy.settings.permissionsAddPattern}
        className="h-[22px] min-w-[120px] flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/** Permissions 分区：作用域切换（全局/会话 sidecar）+ 模式分段 + bash/write/edit allow/block chips + 深比较控制保存。 */
function PermissionsSection({ rules, onSave, sessionRules, onLoadSession, onSaveSession }: PermissionsSectionProps) {
  // 语言切换后随渲染重估（模块级常量会冻结首个 locale）
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
  /** 作用域：全局规则文件 / 当前会话 sidecar（G2） */
  const [scope, setScope] = React.useState<'global' | 'session'>('global');
  /** 会话作用域无 sidecar 时，用户点「创建独立规则」进入本地编辑态（保存成功落 sidecar 后自然退出） */
  const [editingSidecar, setEditingSidecar] = React.useState(false);
  const baseline = scope === 'global' ? rules : sessionRules?.rules ?? null;
  const hasSidecar = sessionRules?.source === 'thread';
  const showFollowGlobal = scope === 'session' && !hasSidecar && !editingSidecar;
  const [draft, setDraft] = React.useState<PermissionRules | null>(rules === null ? null : clonePermissionRules(rules));
  const [inputDrafts, setInputDrafts] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<SaveStatus>(null);

  React.useEffect(() => {
    if (scope === 'session') onLoadSession();
  }, [scope, onLoadSession]);

  // 基线（作用域规则）引用变化：外部刷新/保存回写 → 草稿同步
  React.useEffect(() => {
    setDraft(baseline === null ? null : clonePermissionRules(baseline));
    setInputDrafts({});
    setStatus(null);
  }, [baseline]);

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
    const ok = scope === 'global' ? await onSave(clonePermissionRules(draft)) : await onSaveSession(clonePermissionRules(draft));
    setSaving(false);
    setStatus(ok ? 'saved' : 'failed');
  };

  /** 会话作用域无 sidecar：从当前生效规则出发创建独立副本 */
  const createSidecar = (): void => {
    setDraft(clonePermissionRules(sessionRules?.rules ?? rules ?? defaultPermissionRules()));
    setEditingSidecar(true);
  };

  const followGlobal = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    const ok = await onSaveSession(null);
    setSaving(false);
    setStatus(ok ? 'saved' : 'failed');
    if (ok) setEditingSidecar(false);
  };

  if (baseline === null || draft === null) {
    return (
      <section>
        <SettingsPageHeader title={copy.settings.permissionsTitle} description={copy.settings.permissionsDesc} />
        <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.permissionsLoading}</p>
      </section>
    );
  }

  return (
    <section>
      <SettingsPageHeader title={copy.settings.permissionsTitle} description={copy.settings.permissionsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div>
          <SegmentedControl
            aria-label={copy.settings.permissionsTitle}
            options={[
              { value: 'global' as const, label: copy.settings.permissionsScopeGlobal },
              { value: 'session' as const, label: copy.settings.permissionsScopeSession },
            ]}
            value={scope}
            onChange={setScope}
          />
        </div>
        {showFollowGlobal ? (
          <div className="flex flex-col items-start gap-[8px] rounded-xl border border-dashed border-border px-[20px] py-[16px]">
            <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.permissionsFollowGlobal}</p>
            <button
              type="button"
              onClick={createSidecar}
              className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {copy.settings.permissionsCreateSession}
            </button>
          </div>
        ) : null}
        {showFollowGlobal ? null : (
          <>
            <SettingsCard className="divide-y divide-border">
              <SettingsRow title={copy.settings.permissionsMode}>
                <SegmentedControl aria-label={copy.settings.permissionsMode} options={MODE_OPTIONS} value={draft.mode} onChange={setMode} />
              </SettingsRow>
              <div className="flex flex-col gap-[4px] px-[20px] py-[11px]">
                <p className="text-[11.5px] leading-[16px] text-muted-foreground">{copy.settings.permissionsModeHint}</p>
                <p className="text-[11.5px] leading-[16px] text-muted-foreground">{copy.settings.permissionsGlobHint}</p>
              </div>
            </SettingsCard>
            {TOOLS.map((tool) => (
              <SettingsCard key={tool}>
                <div className="px-[20px] pt-[13px] pb-[10px]">
                  <p className="text-[13px] leading-[18px] font-medium text-foreground">{TOOL_TITLES[tool]}</p>
                </div>
                <div className="flex flex-col gap-[6px] px-[20px] pb-[14px]">
                  <p className="text-[11.5px] leading-[16px] text-muted-foreground">{KIND_LABELS.allowPatterns}</p>
                  {patternEditor({
                    patterns: draft[tool].allowPatterns,
                    inputDraft: inputDrafts[`${tool}:allowPatterns`] ?? '',
                    onInputDraftChange: (value) => setInputDrafts((prev) => ({ ...prev, [`${tool}:allowPatterns`]: value })),
                    onAppend: (raw) => updatePatterns(tool, 'allowPatterns', (patterns) => appendPatterns(patterns, raw)),
                    onRemove: (pattern) => updatePatterns(tool, 'allowPatterns', (patterns) => patterns.filter((item) => item !== pattern)),
                  })}
                </div>
                <div className="flex flex-col gap-[6px] border-t border-border px-[20px] py-[12px]">
                  <p className="text-[11.5px] leading-[16px] text-muted-foreground">{KIND_LABELS.blockPatterns}</p>
                  {patternEditor({
                    patterns: draft[tool].blockPatterns,
                    inputDraft: inputDrafts[`${tool}:blockPatterns`] ?? '',
                    onInputDraftChange: (value) => setInputDrafts((prev) => ({ ...prev, [`${tool}:blockPatterns`]: value })),
                    onAppend: (raw) => updatePatterns(tool, 'blockPatterns', (patterns) => appendPatterns(patterns, raw)),
                    onRemove: (pattern) => updatePatterns(tool, 'blockPatterns', (patterns) => patterns.filter((item) => item !== pattern)),
                  })}
                </div>
              </SettingsCard>
            ))}
            <div className="flex items-center gap-[10px]">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || (baseline !== null && rulesEqual(draft, baseline))}
                className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.settings.permissionsSave}
              </button>
              {scope === 'session' && hasSidecar ? (
                <button
                  type="button"
                  onClick={() => void followGlobal()}
                  disabled={saving}
                  className="cursor-pointer rounded-lg px-[6px] py-[6px] text-[12.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  {copy.settings.permissionsFollowGlobalAction}
                </button>
              ) : null}
              {status === 'saved' ? <p className="text-[12px] leading-[16px] text-muted-foreground">{copy.settings.permissionsSaved}</p> : null}
              {status === 'failed' ? <p className="text-[12px] leading-[16px] text-destructive">{copy.settings.permissionsSaveFailed}</p> : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export { PermissionsSection };
