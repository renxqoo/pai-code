import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TickerText } from '../ticker-text';

describe('TickerText 静态渲染', () => {
  test('静止态：单行截断呈现文本本体，不渲染滑动轨', () => {
    const html = renderToStaticMarkup(<TickerText text="一行放不下的思考预览" active={false} />);
    expect(html).toContain('truncate');
    expect(html).toContain('一行放不下的思考预览');
    expect(html).not.toContain('ticker-track');
    expect(html).not.toContain('sr-only');
  });

  test('激活态首帧：测量未发生前同样以截断呈现（溢出后才切换滑动轨）', () => {
    const html = renderToStaticMarkup(
      <TickerText text="流式输出中的长文本" active className="text-meta-faint" />,
    );
    expect(html).toContain('truncate');
    expect(html).toContain('流式输出中的长文本');
    expect(html).toContain('text-meta-faint');
    expect(html).not.toContain('ticker-track');
  });

  test('空文本：渲染空截断壳，不崩溃', () => {
    const html = renderToStaticMarkup(<TickerText text="" active={false} />);
    expect(html).toContain('truncate');
  });
});
