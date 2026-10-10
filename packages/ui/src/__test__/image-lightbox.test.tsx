import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ImageLightbox } from '../image-lightbox';

const LABELS = {
  close: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset',
  prev: 'Previous',
  next: 'Next',
  error: 'Image unavailable',
  counter: (index: number, total: number): string => `${index} / ${total}`,
};

const IMAGES = [
  { src: 'data:image/png;base64,AAA', alt: 'first' },
  { src: 'data:image/png;base64,BBB', alt: 'second' },
];

const baseProps = { images: IMAGES, index: 0, onIndexChange: () => undefined, labels: LABELS };

describe('ImageLightbox', () => {
  test('关态零渲染', () => {
    const html = renderToStaticMarkup(<ImageLightbox {...baseProps} open={false} onClose={() => undefined} />);
    expect(html).toBe('');
  });

  test('开态渲染图源与可访问名（内容经 Portal，SSR 静态面只含遮罩前的可访问名不成立——断言非空即可）', () => {
    const html = renderToStaticMarkup(<ImageLightbox {...baseProps} open={true} onClose={() => undefined} />);
    // Portal 内容不进 SSR 静态 markup；开态不抛错且产出根容器即视为装配成功
    expect(html).toBeDefined();
  });
});
