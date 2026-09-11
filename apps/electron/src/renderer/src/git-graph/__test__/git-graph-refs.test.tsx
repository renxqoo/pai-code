import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { GitGraphRefs } from '../git-graph-refs';

/** refs token 拆 pill：attached「HEAD -> main」两枚、detached「HEAD」一枚、普通分支灰 pill。 */
describe('GitGraphRefs', () => {
  test('attached HEAD：「HEAD -> main」拆为 HEAD pill + main pill', () => {
    const html = renderToStaticMarkup(<GitGraphRefs refs={['HEAD -> main']} />);
    expect(html).toContain('HEAD');
    expect(html).toContain('main');
    expect(html.match(/<span/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('detached HEAD：裸「HEAD」token 只渲染 HEAD pill；「HEAD, main」拆两枚', () => {
    const detached = renderToStaticMarkup(<GitGraphRefs refs={['HEAD']} />);
    expect(detached).toContain('HEAD');
    expect(detached).not.toContain('->');

    const detachedWithBranch = renderToStaticMarkup(<GitGraphRefs refs={['HEAD, main']} />);
    expect(detachedWithBranch).toContain('HEAD');
    expect(detachedWithBranch).toContain('main');
  });

  test('普通分支装饰渲染为分支名 pill；空 refs 不渲染', () => {
    const html = renderToStaticMarkup(<GitGraphRefs refs={['feature-x']} />);
    expect(html).toContain('feature-x');
    expect(renderToStaticMarkup(<GitGraphRefs refs={[]} />)).toBe('');
  });

  test('多 token 依次渲染（merge 行同时有 HEAD 与另一分支尖）', () => {
    const html = renderToStaticMarkup(<GitGraphRefs refs={['HEAD -> main', 'release']} />);
    expect(html).toContain('HEAD');
    expect(html).toContain('main');
    expect(html).toContain('release');
  });
});
