import * as React from 'react';
import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Image } from 'react-native';
import { MarkdownImage } from '@/features/chat/markdown/markdown-image';

type SizeCallback = (width: number, height: number) => void;

/** 直控 getSize（jest-setup 的两态桩按用例意图逐个覆盖）。 */
function stubGetSize(impl: (uri: string, success?: SizeCallback, failure?: (error: unknown) => void) => void): void {
  jest.spyOn(Image, 'getSize').mockImplementation(((uri: string, success?: SizeCallback, failure?: (error: unknown) => void) => {
    impl(uri, success, failure);
    return undefined as never;
  }) as typeof Image.getSize);
}

const styleOf = (node: { props: { style?: unknown } }): Record<string, unknown> => {
  const entries = (Array.isArray(node.props.style) ? node.props.style : [node.props.style]) as readonly (Record<string, unknown> | undefined)[];
  return Object.assign({}, ...entries.map((entry) => entry ?? {}));
};

describe('MarkdownImage', () => {
  it('取尺寸失败或零尺寸时退固定高兜底，不崩', async () => {
    stubGetSize((_uri, _success, failure) => failure?.(new Error('offline')));
    const failed = await render(<MarkdownImage alt="失败" uri="https://example.com/a.png" />);
    expect(failed.toJSON()).toBeTruthy();

    stubGetSize((_uri, success) => success?.(0, 0));
    const zero = await render(<MarkdownImage alt="零尺寸" uri="https://example.com/b.png" />);
    expect(styleOf(zero.getByLabelText('零尺寸'))).toMatchObject({ height: 200, width: '100%' });
  });

  it('尺寸就绪后按原图比例定高', async () => {
    stubGetSize((_uri, success) => success?.(320, 160));
    const view = await render(<MarkdownImage alt="比例图" uri="https://example.com/c.png" />);
    const image = view.getByLabelText('比例图');
    expect(styleOf(image)).toMatchObject({ aspectRatio: 2, width: '100%' });
  });

  it('卸载后迟到的尺寸回调不落状态（alive 守卫），不崩', async () => {
    let late: SizeCallback | undefined;
    stubGetSize((_uri, success) => {
      late = success;
    });
    const view = await render(<MarkdownImage alt="迟到" uri="https://example.com/d.png" />);
    await view.unmount();
    expect(() => late?.(320, 240)).not.toThrow();
  });
});
