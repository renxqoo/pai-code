import { createStore } from 'zustand/vanilla';

/**
 * 图片预览器开合真相（与 ui-store 同构的独立域模块：ui-store 已 90+ 行状态面，
 * 灯箱是纯覆盖层，单独成 store 避免继续膨胀）。全局唯一实例：`{ images, index }`
 * 非 null = 开着；三处调用点（用户消息图/附件 chip/正文图）都只经 openViewer 投递。
 */

/** 预览图源：data URL 或已过安全判定的 http(s)/blob: URL；name 供计数条与错误态展示。 */
export type ViewerImage = { src: string; name: string };

export type ImageViewerState = {
  /** null = 关闭；非 null = 以 images 全列表打开并定位 index（多图可左右导航）。 */
  viewer: { images: readonly ViewerImage[]; index: number } | null;
};

export type ImageViewerActions = {
  /** 打开预览：同一列表重复打开以最新投递为准（幂等，无开合翻转语义）。 */
  openViewer: (images: readonly ViewerImage[], index: number) => void;
  closeViewer: () => void;
  /** 多图导航（环绕）；单图无操作。 */
  navigateViewer: (delta: 1 | -1) => void;
  /** 当前定位直接写（Esc 链关闭外的受控变更，如灯箱内 ‹ ›）。 */
  setViewerIndex: (index: number) => void;
  reset: () => void;
};

export type ImageViewerStore = ReturnType<typeof createImageViewerStore>;

export function createImageViewerStore() {
  return createStore<ImageViewerState & ImageViewerActions>()((set) => ({
    viewer: null,
    openViewer: (images, index) =>
      set(images.length === 0 ? { viewer: null } : { viewer: { images, index: Math.min(Math.max(index, 0), images.length - 1) } }),
    closeViewer: () => set({ viewer: null }),
    navigateViewer: (delta) =>
      set((state) => {
        if (state.viewer === null || state.viewer.images.length <= 1) return state;
        const total = state.viewer.images.length;
        return { viewer: { images: state.viewer.images, index: (state.viewer.index + delta + total) % total } };
      }),
    setViewerIndex: (index) =>
      set((state) => (state.viewer === null ? state : { viewer: { images: state.viewer.images, index } })),
    reset: () => set({ viewer: null }),
  }));
}

/** 生产装配单例：模块级引用即共享面（与 ui-store 同构）。 */
export const imageViewerStore = createImageViewerStore();

/** 单例动作直出（Esc 链等非渲染方持有的稳定引用；zustand 动作创建即恒定）。 */
const { openViewer, closeViewer, navigateViewer, setViewerIndex } = imageViewerStore.getState();
export { openViewer, closeViewer, navigateViewer, setViewerIndex };
