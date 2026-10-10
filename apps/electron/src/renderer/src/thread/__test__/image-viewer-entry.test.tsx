import { afterEach, describe, expect, test } from 'bun:test';

import { render } from '@/testing/render';
import { imageViewerStore } from '@/image-viewer/image-viewer-store';
import { AttachmentChips } from '@/composer/attachment-chips';
import { UserMessageRow } from '../user-message-row';
import type { SessionMessage } from '../thread-model';

afterEach(() => {
  imageViewerStore.getState().reset();
});

const MESSAGE: SessionMessage = {
  id: 'm1',
  role: 'user',
  text: '看图',
  at: 0,
  images: [
    { data: 'AAA', mimeType: 'image/png' },
    { data: 'BBB', mimeType: 'image/jpeg' },
  ],
} as SessionMessage;

describe('用户消息图片点击开灯箱', () => {
  test('点第 2 张：以全列表 + 命中索引投递（多图可导航）', () => {
    const view = render(<UserMessageRow message={MESSAGE} onEdit={() => undefined} />);
    const buttons = [...view.container.querySelectorAll('img')].filter((el) => el.src.startsWith('data:'));
    expect(buttons.length).toBe(2);
    buttons[1].closest('button')?.click();
    const viewer = imageViewerStore.getState().viewer;
    expect(viewer?.index).toBe(1);
    expect(viewer?.images).toHaveLength(2);
    expect(viewer?.images[1].src).toBe('data:image/jpeg;base64,BBB');
    view.unmount();
  });
});

describe('附件 chip 点击开灯箱', () => {
  test('点第 1 个 chip：以全列表 + 命中索引投递', () => {
    const view = render(
      <AttachmentChips
        items={[
          { id: 1, preview: 'data:image/png;base64,X1', name: 'a.png' },
          { id: 2, preview: 'data:image/png;base64,X2', name: 'b.png' },
        ]}
        removeLabel="移除"
        onRemove={() => undefined}
      />,
    );
    view.container.querySelectorAll('img')[0].closest('button')?.click();
    const viewer = imageViewerStore.getState().viewer;
    expect(viewer?.index).toBe(0);
    expect(viewer?.images.map((image) => image.name)).toEqual(['a.png', 'b.png']);
    view.unmount();
  });

  test('移除入口仍独立于预览入口（点击移除不投递灯箱）', () => {
    const removed: number[] = [];
    const view = render(
      <AttachmentChips
        items={[{ id: 7, preview: 'data:image/png;base64,X1', name: 'a.png' }]}
        removeLabel="移除"
        onRemove={(id) => removed.push(id)}
      />,
    );
    view.container.querySelector('button[aria-label="移除"]')?.click();
    expect(removed).toEqual([7]);
    expect(imageViewerStore.getState().viewer).toBeNull();
    view.unmount();
  });
});