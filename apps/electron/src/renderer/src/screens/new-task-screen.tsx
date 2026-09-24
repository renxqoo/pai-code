import * as React from 'react';
import { useStore } from 'zustand';

import { thinkingLevelLabel, thinkingLevelOfLabel, type ApiOutcome, type CommandView, type PermMode } from '@paiapp/contracts';

import { branchSegmentOf } from '@/composer/branch-segment';
import { BranchPanel } from '@/composer/branch-panel';
import { branchSwitchLocked } from '@/composer/branch-switch-lock';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { thinkingLevelOptions } from '@/composer/composer-selection';
import { CreateBranchDialog } from '@/composer/create-branch-dialog';
import { PromptCard, type ComposerAttachment } from '@/composer/prompt-card';
import { PromptContextBar } from '@/composer/prompt-context-bar';
import { PromptInputArea } from '@/composer/prompt-input-area';
import { QuickTaskChips } from '@/composer/quick-task-chips';
import { WorkspacePickerDialog } from '@/composer/workspace-picker-dialog';
import { GitGraphDialog } from '@/git-graph/git-graph-dialog';
import { store as liveStore } from '@/live/workspace-runtime';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useGitGraph } from '@/hooks/use-git-graph';
import { greetingKeyOf } from '@/lib/greeting';
import { baseNameOf } from '@/lib/project-dirs';
import { copyOfError } from '@/lib/error-text';
import { greetingTexts, quickTaskItems } from '@/screens/new-task-view-model';
import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { copy } from '@/strings';

/** 本页互斥的浮层：同一时刻至多一个（目录弹窗 / 分支面板 → 创建分支 / 图谱弹窗顺次切换）。 */
type NewTaskDialog = 'workspace' | 'branch' | 'create-branch' | 'graph' | null;

/** 新建任务提交面（渲染层内部形状，图片载荷转换由接线层负责）。 */
export type NewTaskStart = {
  cwd: string
  trusted: boolean
  /** `provider/modelId` */
  model: string
  /** null = 不干预（hub 按 settings 缺省） */
  permissionMode: PermMode | null
  /** 思考档（协议档位值；null = 跟随缺省） */
  thinkingLevel: string | null
  text: string
  attachments: readonly ComposerAttachment[]
}

type NewTaskScreenProps = {
  /** 已知项目目录（最近优先） */
  knownDirs: readonly string[]
  /** 预会话命令目录（`/` 补全数据源：用户级启用技能预构；建会话后由 hub 目录接管） */
  commands: readonly CommandView[]
  /** 打开时的预选目录（当前会话目录 / 侧栏项目行） */
  defaultCwd: string
  /** 信任开关初值（偏好 trustedDefault） */
  trustedDefault: boolean
  /** 初始模型（项目记忆 → 全局默认 → 当前会话 → 首个可用；cwd 变化后重取） */
  defaultModelFor: (cwd: string) => string
  modelOptions: readonly string[]
  /** 无可选模型时的引导文案（点击跳设置） */
  noModelsLabel: string
  onOpenSettings?: () => void
  /** 权限模式缺省（hub settings；本地未选时显示并作为不干预基线） */
  defaultPermissionMode: PermMode
  onSearchFiles: (cwd: string, query: string) => Promise<string[] | null>
  onListBranches: (cwd: string) => Promise<ApiOutcome<'git/branches'>>
  onListGraph: (cwd: string) => Promise<ApiOutcome<'git/graph'>>
  onCheckoutBranch: (cwd: string, branch: string, create: boolean) => Promise<ApiOutcome<'git/checkout'>>
  onPickDirectory: (defaultPath: string | null) => Promise<string | null>
  /** 创建会话并投递首条消息；resolve true = 已建会话（本页关闭） */
  onCreate: (input: NewTaskStart) => Promise<boolean>
  onClose: () => void
  /** 分支切换失败等提示出口（通知条层级） */
  onNotify: (text: string) => void
  /** 本地浮层开合上报：全局 Esc 链据此不穿透（浮层自行消费 Esc） */
  onDialogOpenChange: (open: boolean) => void
}

/**
 * 新建任务整页：问候语 + 项目/分支条 + 白卡输入框 + 快捷任务胶囊。
 * 与线程页共用 PromptCard / PromptInputArea / PromptContextBar / ComposerActionsRow；
 * 会话尚未创建：`/` 补全用预构命令目录（用户级启用技能），思考档恒四档本地选择
 * （null = 跟随缺省），压缩与用量无数据面不渲染。
 */
function NewTaskScreen({
  knownDirs,
  commands,
  defaultCwd,
  trustedDefault,
  defaultModelFor,
  modelOptions,
  noModelsLabel,
  onOpenSettings,
  defaultPermissionMode,
  onSearchFiles,
  onListBranches,
  onListGraph,
  onCheckoutBranch,
  onPickDirectory,
  onCreate,
  onClose,
  onNotify,
  onDialogOpenChange,
}: NewTaskScreenProps) {
  const [cwd, setCwd] = React.useState(defaultCwd);
  const [trusted, setTrusted] = React.useState(trustedDefault);
  const [draft, setDraft] = React.useState('');
  /** null = 跟随所选项目的默认模型记忆 */
  const [model, setModel] = React.useState<string | null>(null);
  /** null = 不干预（hub 按 settings 缺省建线程） */
  const [permissionMode, setPermissionMode] = React.useState<PermMode | null>(null);
  /** 思考档（协议档位值；null = 跟随缺省，创建时不干预） */
  const [thinkingLevel, setThinkingLevel] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<NewTaskDialog>(null);
  const [picking, setPicking] = React.useState(false);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  /** 同步闸：连按 Enter/双击时 state 闭包仍为旧值，异步在途必须用 ref 拦 */
  const busyRef = React.useRef(false);
  /** 问候语按打开时刻定段（小时级，不挂 tick） */
  const [greetingKey] = React.useState(() => greetingKeyOf(new Date().getHours()));
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const branches = useGitBranches(cwd, onListBranches);
  /** 图谱只在弹窗打开时拉取（无轮询） */
  const graph = useGitGraph(cwd, onListGraph, 0, dialog === 'graph');
  /** 分支切换锁（与线程页同一把，T36 引用 T23 裁决）：所选目录上任一线程在跑即锁定——
   * 新建任务页可选中运行中会话的目录，不放锁就能从这页拆台运行中的 agent。 */
  const branchLocked = useStore(liveStore, (s) => branchSwitchLocked(s.sessions, s.threads, cwd));

  /** 锁定期间已开的分支面板/创建弹窗就地收口（触发器会消失，但已开的模态弹窗不会自灭） */
  React.useEffect(() => {
    if (branchLocked && (dialog === 'branch' || dialog === 'create-branch')) setDialog(null);
  }, [branchLocked, dialog]);

  /** 面板打开即重拉：脏计数随工作区实时变化，缓存快照会过期（cwd 不变不会自动重拉） */
  React.useEffect(() => {
    if (dialog === 'branch') branches.refresh();
  }, [dialog, branches.refresh]);
  const texts = greetingTexts(greetingKey);
  const segment = branchSegmentOf(branches.view, branches.loading, branches.failed);
  const effectiveModel = model ?? defaultModelFor(cwd);
  const searchFiles = React.useCallback((query: string) => onSearchFiles(cwd, query), [cwd, onSearchFiles]);
  /** 可提交：有草稿 + 已选工作目录（无目录时主进程会拒绝，不给死路）+ 无在途动作 */
  const canSubmit = draft.trim().length > 0 && cwd.length > 0 && !creating;

  // 浮层打开时把计数交给全局 Esc 链：浮层自行消费 Esc，不穿透关闭整页
  React.useEffect(() => {
    onDialogOpenChange(dialog !== null);
    return () => onDialogOpenChange(false);
  }, [dialog, onDialogOpenChange]);

  const selectCwd = (next: string): void => {
    setCwd(next);
    // 换项目即回到该项目默认模型记忆（不把上一个项目的选择带过去），并清掉旧目录的失败文案
    setModel(null);
    setThinkingLevel(null);
    setBranchError(null);
    setDialog(null);
  };

  const openFolder = (): void => {
    if (picking || creating) return;
    setPicking(true);
    void onPickDirectory(cwd.length > 0 ? cwd : null).then(
      (picked) => {
        setPicking(false);
        if (picked !== null) selectCwd(picked);
      },
      () => setPicking(false),
    );
  };

  /** 切分支：失败走通知条，成功后刷新分支视图（当前分支与列表） */
  const switchBranch = (branch: string): void => {
    if (busyRef.current || branchLocked) return;
    busyRef.current = true;
    setCheckingOut(true);
    setDialog(null);
    void onCheckoutBranch(cwd, branch, false).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          onNotify(copyOfError(outcome.error));
          return;
        }
        branches.refresh();
      },
      () => {
        busyRef.current = false;
        setCheckingOut(false);
      },
    );
  };

  /** 创建并检出：失败在弹窗内联呈现（不关弹窗，便于改名重试）；与切换同一把锁（checkout -b 同样改写 HEAD 归属） */
  const createBranch = (branch: string): void => {
    if (busyRef.current || branchLocked) return;
    busyRef.current = true;
    setCheckingOut(true);
    setBranchError(null);
    void onCheckoutBranch(cwd, branch, true).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          setBranchError(copyOfError(outcome.error));
          return;
        }
        setDialog(null);
        branches.refresh();
      },
      () => {
        busyRef.current = false;
        setCheckingOut(false);
      },
    );
  };

  const submit = (text: string, attachments: readonly ComposerAttachment[]): Promise<boolean> => {
    if (busyRef.current || cwd.length === 0) return Promise.resolve(false);
    busyRef.current = true;
    setCreating(true);
    return onCreate({ cwd, trusted, model: effectiveModel, permissionMode, thinkingLevel, text, attachments }).then(
      (ok) => {
        busyRef.current = false;
        setCreating(false);
        if (ok) onClose();
        return ok;
      },
      () => {
        busyRef.current = false;
        setCreating(false);
        return false;
      },
    );
  };

  const prefill = (prompt: string): void => {
    setDraft(prompt);
    textareaRef.current?.focus();
  };

  /** 换模型即重置思考档：不把旧模型的选择带过去（缺省=跟随 hub 设置）。 */
  const selectModel = (value: string): void => {
    setModel(value);
    setThinkingLevel(null);
  };

  const effortOptions = thinkingLevelOptions();
  const effortDefaultValue = copy.composer.effortDefault;
  const selectEffort = (label: string): void => {
    setThinkingLevel(label === effortDefaultValue ? null : thinkingLevelOfLabel(label));
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-[40px] pb-[18px]">
      <div className={`${CONVERSATION_COLUMN_CLASS} flex flex-col items-center`}>
        <h1 className="text-[26px] leading-[34px] font-semibold tracking-tight text-foreground">{texts.title}</h1>
        <p className="pt-[6px] text-[13px] leading-[20px] text-muted-foreground">{texts.subtitle}</p>
        <div className="mt-[26px] w-full">
          <PromptContextBar
            project={{
              // 无预选目录时项目段仍可点（入口不能消失），文案退为「选择工作区」
              label: cwd.length > 0 ? baseNameOf(cwd) || cwd : copy.newTask.workspacePickerTitle,
              title: cwd.length > 0 ? cwd : undefined,
              ariaLabel: copy.composer.projectSegment,
              onSelect: () => setDialog('workspace'),
            }}
            branch={
              cwd.length === 0
                ? null
                : {
                    ...segment,
                    ariaLabel: copy.composer.branchSegment,
                    // 非仓库/加载中/目录上有线程在跑不给面板入口（列表为空或切基线拆台运行中 agent）
                    ...(branches.view?.isRepo === true && !branchLocked
                      ? {
                          panel: {
                            open: dialog === 'branch',
                            onOpenChange: (open: boolean) => setDialog(open ? 'branch' : null),
                            content: (
                              <BranchPanel
                                view={branches.view}
                                loading={branches.loading}
                                failed={branches.failed}
                                busy={checkingOut}
                                onSelect={switchBranch}
                                onCreate={() => {
                                  setBranchError(null);
                                  setDialog('create-branch');
                                }}
                                onOpenGraph={() => setDialog('graph')}
                              />
                            ),
                          },
                        }
                      : {}),
                  }
            }
          />
          <PromptCard
            className="relative z-[1] -mt-[10px]"
            value={draft}
            onSubmit={submit}
            scope="new-task"
            restore={null}
            canSubmit={canSubmit}
            input={
              <PromptInputArea
                value={draft}
                onChange={setDraft}
                placeholder={copy.newTask.placeholder}
                textareaRef={textareaRef}
                commands={commands}
                slashAriaLabel={copy.composer.slashAria}
                fileAriaLabel={copy.composer.fileAria}
                onSearchFiles={searchFiles}
                searchKey={cwd}
                queueing={false}
              />
            }
            actions={({ openFilePicker }) => (
              <ComposerActionsRow
                model={effectiveModel}
                modelOptions={modelOptions}
                onSelectModel={selectModel}
                noModelsLabel={noModelsLabel}
                onOpenSettings={onOpenSettings}
                attachLabel={copy.composer.attach}
                onAttach={openFilePicker}
                sendLabel={copy.composer.send}
                stopLabel={copy.composer.stop}
                canSend={canSubmit}
                sending={creating}
                generating={false}
                onStop={() => undefined}
                permissionMode={permissionMode ?? defaultPermissionMode}
                onSelectPermissionMode={setPermissionMode}
                effort={{
                  value: thinkingLevel === null ? effortDefaultValue : thinkingLevelLabel(thinkingLevel),
                  options: [effortDefaultValue, ...effortOptions],
                  onSelect: selectEffort,
                }}
                usage={null}
              />
            )}
          />
        </div>
        <div className="pt-[18px]">
          <QuickTaskChips items={quickTaskItems()} onSelect={prefill} />
        </div>
      </div>
      <WorkspacePickerDialog
        open={dialog === 'workspace'}
        onOpenChange={(open) => setDialog(open ? 'workspace' : null)}
        dirs={knownDirs}
        selectedCwd={cwd}
        onSelect={selectCwd}
        trusted={trusted}
        onTrustedChange={setTrusted}
        onOpenFolder={openFolder}
        picking={picking}
      />
      <GitGraphDialog
        open={dialog === 'graph'}
        onOpenChange={(open) => setDialog(open ? 'graph' : null)}
        view={graph.view}
        loading={graph.loading}
        failed={graph.failed}
        onRefresh={graph.refresh}
      />
      <CreateBranchDialog
        open={dialog === 'create-branch'}
        onOpenChange={(open) => setDialog(open ? 'create-branch' : null)}
        busy={checkingOut}
        error={branchError}
        onSubmit={createBranch}
      />
    </div>
  );
}

export { NewTaskScreen };
export type { NewTaskScreenProps };
