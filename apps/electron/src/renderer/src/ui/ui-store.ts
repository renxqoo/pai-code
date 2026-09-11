import { createStore } from 'zustand/vanilla';

import type { QueuedDraftImages } from '@/composer/queued-drafts';
import type { ProjectFileNode } from '@/sidebar/build-file-tree';
import { expandGroup, toggleGroupFold, type GroupFold } from '@/sidebar/group-collapse';
import type { SidebarView } from '@/sidebar/sidebar-view';
import type { SettingsSectionId } from '@/settings/settings-sections';

/**
 * 渲染层 UI 态 store（zustand vanilla + 组件经 useStore 选择器订阅）。
 * 与 live store 的分界按「写权 + 生命周期」：这里只放本地交互真相
 * （侧栏几何/视图/搜索/开合/草稿/项目文件面板），跟随应用存活、
 * 跨语言切换根重挂载保持；服务端事件镜像一律不进本 store。
 * 动作全部纯 set 零 IO——副作用居留订阅点的 effect 或控制器模块
 * （项目文件面板的异步建树在 sidebar/project-files 控制器）。
 */

/** 侧栏宽度默认值与钳制上下限（装配层单一真相，resize hook 经参数注入限位）。 */
export const SIDEBAR_WIDTH = 264;
export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 400;

const INITIAL_GROUP_FOLD: GroupFold = { collapsed: new Set<string>(), expanded: new Set<string>() };

/** 项目文件面板数据面（控制器 begin/complete/close 写入；null target = 关闭）。 */
export type ProjectFilesState = {
  target: { name: string; path: string } | null;
  tree: readonly ProjectFileNode[];
  loading: boolean;
};

export type UiState = {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarView: SidebarView;
  sidebarSearchOpen: boolean;
  sidebarQuery: string;
  /** 聚焦信号：每次 ⌘K/快捷行触发递增，驱动已展开的搜索框重新聚焦。 */
  searchFocusToken: number;
  sidebarGroupFold: GroupFold;
  settingsOpen: boolean;
  /** 命令面板跳设置分区的一次性入口（关闭即清，普通打开不受影响）。 */
  settingsEntry: SettingsSectionId | null;
  usageOpen: boolean;
  newTaskOpen: boolean;
  /** 进入新建任务页的预填目录；'' = 跟随当前会话目录。 */
  newTaskCwd: string;
  /** 每次进入递增：整页重挂载即重置页内状态。 */
  newTaskKey: number;
  /** 页内浮层开合（计入全局 Esc 链：浮层自行消费 Esc，不穿透关闭整页）。 */
  newTaskDialogOpen: boolean;
  composerDraft: string;
  /** 会话草稿（线程 id 寻址；切走再回来不丢，互不串扰）。 */
  drafts: Readonly<Record<string, string>>;
  /** 停止二次确认条开合（存在在途子代理时停止不可恢复；Esc 链同源）。 */
  confirmStop: boolean;
  /** 输入卡图片回填一次性信号：token 递增即并入附件态（消费端 PromptCard）。 */
  composerRestore: { token: number; images: QueuedDraftImages } | null;
  /** 分支视图失效代次（新建任务页 checkout 成功递增，输入卡上下文条分支段重拉）。 */
  branchRevision: number;
  projectFiles: ProjectFilesState;
};

export type UiActions = {
  setSidebarWidth: (width: number) => void;
  toggleSidebarCollapsed: () => void;
  collapseSidebar: () => void;
  setSidebarView: (view: SidebarView) => void;
  /** ⌘K/快捷行入口：收起态先展开（焦点不得劫进零宽容器），已展开重新聚焦。 */
  openSidebarSearch: () => void;
  /** Esc 收起搜索：清空过滤词（侧栏收起时保留过滤词走 collapse 路径，不经此动作）。 */
  closeSidebarSearch: () => void;
  setSidebarQuery: (value: string) => void;
  toggleGroupFoldKey: (key: string) => void;
  expandGroupKey: (key: string) => void;
  openSettings: () => void;
  openSettingsAt: (section: SettingsSectionId) => void;
  closeSettings: () => void;
  openUsage: () => void;
  closeUsage: () => void;
  /** 进入新建任务页（cwd 空 = 跟随当前会话目录）；重复进入即重挂载，重置页内状态。 */
  openNewTask: (cwd: string) => void;
  closeNewTask: () => void;
  setNewTaskDialogOpen: (open: boolean) => void;
  /** 草稿写入：无活跃线程（threadId 空）只写 composerDraft；否则同步落会话槽。 */
  setDraft: (threadId: string, value: string) => void;
  /** 清当前会话草稿（composer 与会话槽一起清）。 */
  clearDraft: (threadId: string) => void;
  /** 首条消息未投出时回填到新会话草稿槽（新建任务页退出后仍可重发）。 */
  restoreDraft: (threadId: string, text: string) => void;
  setConfirmStop: (open: boolean) => void;
  /** 图片回填信号（token 自增；images 可为空数组——仍产生一次信号，消费端并入零项）。 */
  setComposerRestore: (images: QueuedDraftImages) => void;
  bumpBranchRevision: () => void;
  beginProjectFiles: (target: { name: string; path: string }) => void;
  completeProjectFiles: (tree: readonly ProjectFileNode[]) => void;
  closeProjectFiles: () => void;
  reset: () => void;
};

export type UiStore = ReturnType<typeof createUiStore>;

function initialUiState(): UiState {
  return {
    sidebarWidth: SIDEBAR_WIDTH,
    sidebarCollapsed: false,
    sidebarView: 'grouped',
    sidebarSearchOpen: false,
    sidebarQuery: '',
    searchFocusToken: 0,
    sidebarGroupFold: INITIAL_GROUP_FOLD,
    settingsOpen: false,
    settingsEntry: null,
    usageOpen: false,
    newTaskOpen: false,
    newTaskCwd: '',
    newTaskKey: 0,
    newTaskDialogOpen: false,
    composerDraft: '',
    drafts: {},
    confirmStop: false,
    composerRestore: null,
    branchRevision: 0,
    projectFiles: { target: null, tree: [], loading: false },
  };
}

function omitDraft(drafts: Readonly<Record<string, string>>, threadId: string): Readonly<Record<string, string>> {
  if (!(threadId in drafts)) return drafts;
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== threadId));
}

export function createUiStore() {
  return createStore<UiState & UiActions>()((set) => ({
    ...initialUiState(),
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    collapseSidebar: () => set({ sidebarCollapsed: true }),
    setSidebarView: (view) => set({ sidebarView: view }),
    openSidebarSearch: () =>
      set((state) => ({ sidebarCollapsed: false, sidebarSearchOpen: true, searchFocusToken: state.searchFocusToken + 1 })),
    closeSidebarSearch: () => set({ sidebarSearchOpen: false, sidebarQuery: '' }),
    setSidebarQuery: (value) => set({ sidebarQuery: value }),
    toggleGroupFoldKey: (key) => set((state) => ({ sidebarGroupFold: toggleGroupFold(state.sidebarGroupFold, key) })),
    expandGroupKey: (key) => set((state) => ({ sidebarGroupFold: expandGroup(state.sidebarGroupFold, key) })),
    openSettings: () => set({ settingsOpen: true }),
    openSettingsAt: (section) => set({ settingsOpen: true, settingsEntry: section }),
    closeSettings: () => set({ settingsOpen: false, settingsEntry: null }),
    openUsage: () => set({ usageOpen: true }),
    closeUsage: () => set({ usageOpen: false }),
    openNewTask: (cwd) =>
      set((state) => ({ newTaskOpen: true, newTaskCwd: cwd, newTaskKey: state.newTaskKey + 1, newTaskDialogOpen: false })),
    closeNewTask: () => set({ newTaskOpen: false }),
    setNewTaskDialogOpen: (open) => set({ newTaskDialogOpen: open }),
    setDraft: (threadId, value) =>
      set((state) => ({
        composerDraft: value,
        drafts: threadId.length === 0 ? state.drafts : { ...state.drafts, [threadId]: value },
      })),
    clearDraft: (threadId) =>
      set((state) => ({ composerDraft: '', drafts: omitDraft(state.drafts, threadId) })),
    restoreDraft: (threadId, text) => set((state) => ({ drafts: { ...state.drafts, [threadId]: text } })),
    setConfirmStop: (open) => set({ confirmStop: open }),
    setComposerRestore: (images) =>
      set((state) => ({ composerRestore: { token: (state.composerRestore?.token ?? 0) + 1, images } })),
    bumpBranchRevision: () => set((state) => ({ branchRevision: state.branchRevision + 1 })),
    beginProjectFiles: (target) => set({ projectFiles: { target, tree: [], loading: true } }),
    completeProjectFiles: (tree) =>
      set((state) => ({ projectFiles: { ...state.projectFiles, tree, loading: false } })),
    closeProjectFiles: () => set({ projectFiles: { target: null, tree: [], loading: false } }),
    reset: () => set(initialUiState()),
  }));
}

/** 生产装配单例：模块级引用即共享面（与 live/workspace-runtime 同构）。 */
export const uiStore = createUiStore();
