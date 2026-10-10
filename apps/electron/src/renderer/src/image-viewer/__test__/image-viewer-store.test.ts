import { describe, expect, test } from 'bun:test';

import { createImageViewerStore } from '../image-viewer-store';

const IMAGES = [
  { src: 'data:image/png;base64,AAA', name: 'a.png' },
  { src: 'data:image/png;base64,BBB', name: 'b.png' },
  { src: 'data:image/png;base64,CCC', name: 'c.png' },
];

describe('image-viewer-store', () => {
  test('openViewer 定位到请求索引；空列表不开', () => {
    const store = createImageViewerStore();
    store.getState().openViewer(IMAGES, 1);
    expect(store.getState().viewer).toEqual({ images: IMAGES, index: 1 });
    store.getState().openViewer([], 0);
    expect(store.getState().viewer).toBeNull();
  });

  test('openViewer 索引越界钳制到列表范围', () => {
    const store = createImageViewerStore();
    store.getState().openViewer(IMAGES, 99);
    expect(store.getState().viewer?.index).toBe(2);
    store.getState().openViewer(IMAGES, -3);
    expect(store.getState().viewer?.index).toBe(0);
  });

  test('navigateViewer 环绕导航；单图/关态无操作', () => {
    const store = createImageViewerStore();
    store.getState().openViewer(IMAGES, 0);
    store.getState().navigateViewer(-1);
    expect(store.getState().viewer?.index).toBe(2);
    store.getState().navigateViewer(1);
    expect(store.getState().viewer?.index).toBe(0);

    store.getState().closeViewer();
    store.getState().navigateViewer(1);
    expect(store.getState().viewer).toBeNull();

    store.getState().openViewer([IMAGES[0]], 0);
    store.getState().navigateViewer(1);
    expect(store.getState().viewer?.index).toBe(0);
  });

  test('setViewerIndex 关态不产生 viewer', () => {
    const store = createImageViewerStore();
    store.getState().setViewerIndex(1);
    expect(store.getState().viewer).toBeNull();
  });

  test('closeViewer 后 reset 等价（幂等关态）', () => {
    const store = createImageViewerStore();
    store.getState().openViewer(IMAGES, 0);
    store.getState().reset();
    expect(store.getState().viewer).toBeNull();
    store.getState().reset();
    expect(store.getState().viewer).toBeNull();
  });
});
