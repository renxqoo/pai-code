import * as React from 'react';

import { useStore } from 'zustand';

import { ImageLightbox } from '@x3code/ui';

import { copy } from '@/strings';

import { imageViewerStore } from './image-viewer-store';

/** 文案映射模块级引用恒定（counter 为稳定闭包）；locale 切换经应用根重挂载生效。 */
const lightboxLabels = {
  close: copy.imageViewer.close,
  zoomIn: copy.imageViewer.zoomIn,
  zoomOut: copy.imageViewer.zoomOut,
  reset: copy.imageViewer.reset,
  prev: copy.imageViewer.prev,
  next: copy.imageViewer.next,
  error: copy.imageViewer.error,
  counter: copy.imageViewer.counter,
};

/**
 * 图片预览宿主：全应用唯一实例，挂工作区根部。开合与定位真相在
 * image-viewer-store（覆盖层真相须可订阅——Esc 全局裁决链据此接线），
 * 本组件只做 store → 灯箱受控 props 的映射。
 */
function ImageViewerHost(): React.JSX.Element | null {
  const viewer = useStore(imageViewerStore, (s) => s.viewer);
  if (viewer === null) return null;
  return (
    <ImageLightbox
      open={true}
      onClose={() => imageViewerStore.getState().closeViewer()}
      images={viewer.images}
      index={viewer.index}
      onIndexChange={(index) => imageViewerStore.getState().setViewerIndex(index)}
      labels={lightboxLabels}
    />
  );
}

export { ImageViewerHost };
