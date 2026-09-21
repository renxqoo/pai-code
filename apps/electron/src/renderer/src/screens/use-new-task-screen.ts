import * as React from 'react';
import { useStore } from 'zustand';

import type { CommandView, PermMode } from '@paiapp/contracts';

import type { ComposerAttachment } from '@/composer/prompt-card';
import { imagePayloadOf } from '@/composer/read-image-file';
import { savedSessionEntries } from '@/settings/saved-views';
import { projectDirsOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
import { sessionCardsOf } from '@/sidebar/session-cards';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import type { NewTaskScreenProps, NewTaskStart } from './new-task-screen';

/** 新建任务页已知目录快捷条上限（更多走系统文件夹选择）。 */
const KNOWN_DIRS_LIMIT = 6;

/** 开合动作（模块级恒定引用——页面内部 effect 依赖 props 回调，不稳定会循环 setState）。 */
const openSettingsAction = (): void => {
  uiStore.getState().openSettings();
};
const closeNewTaskAction = (): void => {
  uiStore.getState().closeNewTask();
};

/**
 * 新建任务页装配（T34 M3：自 use-new-task-page 的 screen memo 同构迁出，
 * 订阅随整页挂卸——sessions/saved/models 不进工作区订阅面）。
 * 生命周期与开合在 ui store（newTaskOpen/newTaskCwd/newTaskKey/newTaskDialogOpen）。
 */
export function useNewTaskScreen(enterCwd: string): NewTaskScreenProps {
  const sessionViews = useStore(liveStore, (s) => s.sessions);
  const savedRaw = useStore(liveStore, (s) => s.saved);
  // 派生不进 selector：savedSessionEntries 每调用返回新数组，直接当 selector 会让
  // getSnapshot 永远「变了」——useSyncExternalStore 渲染循环。订阅原始表 + memo 映射。
  const saved = React.useMemo(() => savedSessionEntries(savedRaw), [savedRaw]);
  const models = useStore(liveStore, (s) => s.models);
  const preferences = useStore(liveStore, (s) => s.preferences);
  const hubSettings = useStore(liveStore, (s) => s.hubSettings);
  const hostPhase = useStore(liveStore, (s) => s.hostPhase);
  const activeCwd = useStore(liveStore, (s) => (s.activeThreadId === null ? '' : s.sessions[s.activeThreadId]?.cwd ?? ''));

  /** 预会话命令目录（`/` 补全数据源）：每次打开重拉（技能启停/目录变化即时生效） */
  const [commands, setCommands] = React.useState<readonly CommandView[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    void workspaceActions.fetchCommandPreview().then((list) => {
      if (!cancelled) setCommands(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 已知项目目录（活跃会话 + 已保存会话 cwd 去重，最近优先） */
  const knownDirs = React.useMemo(
    () =>
      projectDirsOf(
        sessionCardsOf(sessionViews).map((session) => ({ cwd: session.cwd, at: session.lastActivityAt })),
        saved.map((session) => ({ cwd: session.cwd, at: session.modifiedAt })),
        KNOWN_DIRS_LIMIT,
      ),
    [sessionViews, saved],
  );

  /** 宿主掉线（从未构建或 failed）：模型位文案不得伪装成「未配置模型」 */
  const hostDown = hostPhase === null || hostPhase === 'failed';
  const modelOptions = React.useMemo(() => models.map((model) => `${model.provider}/${model.modelId}`), [models]);
  /** 权限模式缺省（hub settings 未设置时按 hub 内建 default 档展示）。 */
  const defaultPermissionMode: PermMode = hubSettings?.permissionDefaultMode ?? 'auto';

  /** 切分支包装：成功即失效线程页只读分支段（切完后返回会话页必须看到新分支） */
  const checkoutBranch = React.useCallback(
    async (target: string, branch: string, create: boolean) => {
      const outcome = await workspaceActions.checkoutGitBranch(target, branch, create);
      if (outcome.ok) uiStore.getState().bumpBranchRevision();
      return outcome;
    },
    [],
  );

  const create = React.useCallback(
    async (start: NewTaskStart): Promise<boolean> => {
      const result = await workspaceActions.startTask({
        cwd: start.cwd,
        trusted: start.trusted,
        model: start.model,
        permissionMode: start.permissionMode,
        thinkingLevel: start.thinkingLevel,
        text: start.text,
        images: start.attachments.map((item: ComposerAttachment) => imagePayloadOf(item.payload)),
      });
      if (!result.ok) return false;
      // 首条消息未投出时回填到新会话草稿槽（切到会话页即可重发）
      if (result.sendFailed) uiStore.getState().restoreDraft(result.threadId, start.text);
      return true;
    },
    [],
  );

  return React.useMemo(() => ({
    knownDirs,
    commands,
    defaultCwd: enterCwd.length > 0 ? enterCwd : activeCwd,
    trustedDefault: preferences.trustedDefault,
    defaultModelFor: workspaceActions.defaultModelFor,
    modelOptions,
    noModelsLabel: hostDown ? copy.composer.hostDownModels : copy.composer.noModels,
    onOpenSettings: openSettingsAction,
    defaultPermissionMode,
    onSearchFiles: workspaceActions.searchFilesIn,
    onListBranches: workspaceActions.listGitBranches,
    onListGraph: workspaceActions.listGitGraph,
    onCheckoutBranch: checkoutBranch,
    onPickDirectory: workspaceActions.pickDirectory,
    onCreate: create,
    onClose: closeNewTaskAction,
    onNotify: workspaceActions.showNotice,
    onDialogOpenChange: (open: boolean) => uiStore.getState().setNewTaskDialogOpen(open),
  }), [knownDirs, commands, activeCwd, preferences.trustedDefault, modelOptions, checkoutBranch, create, hostDown, defaultPermissionMode]);
}
