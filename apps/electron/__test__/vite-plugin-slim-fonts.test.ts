import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { slimCssForId, slimFontsPlugin } from '../vite-plugin-slim-fonts';

/**
 * 字体瘦身插件回归：基于 katex 与 @fontsource-variable/inter 的真实分发 css
 * 断言裁剪行为——KaTeX 三格式只留 woff2、Inter 只留 latin/latin-ext 子集、
 * 无关模块不受影响。产物里字体文件是否真的减少由构建后 out/ 目录体现。
 */

function resolvePackageFile(specifier: string): string {
  return new URL(import.meta.resolve(specifier)).pathname;
}

test('katex css：woff/ttf 降级源全部剔除，woff2 源原样保留', () => {
  const css = readFileSync(resolvePackageFile('katex/dist/katex.min.css'), 'utf8');
  const slimmed = slimCssForId(css, '/x/node_modules/katex/dist/katex.min.css');
  expect(slimmed).not.toBeNull();
  if (slimmed === null) return;

  expect(slimmed).not.toContain('.woff)');
  expect(slimmed).not.toContain('.ttf');
  expect(slimmed.match(/format\("woff2"\)/g)?.length).toBe(css.match(/format\("woff2"\)/g)?.length);
  // 只动了 src 降级段：@font-face 数量与规则体不变
  expect(slimmed.match(/@font-face/g)?.length).toBe(css.match(/@font-face/g)?.length);
  expect(slimmed).toContain('.katex .mathnormal');
});

test('katex css：src 仅剩 woff2 单段（抽样一个 face 的完整 src）', () => {
  const css = readFileSync(resolvePackageFile('katex/dist/katex.min.css'), 'utf8');
  const slimmed = slimCssForId(css, '/katex/dist/katex.min.css');
  if (slimmed === null) throw new Error('slimCssForId returned null');

  const src = slimmed.match(/src:url\([^)]*KaTeX_Main-Regular[^)]*\)[^;}]*/)?.[0];
  expect(src).toBe('src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2")');
});

test('Inter css：仅保留 latin 与 latin-ext 两个子集块', () => {
  const css = readFileSync(resolvePackageFile('@fontsource-variable/inter/index.css'), 'utf8');
  const slimmed = slimCssForId(css, '/x/node_modules/@fontsource-variable/inter/index.css');
  expect(slimmed).not.toBeNull();
  if (slimmed === null) return;

  expect(slimmed.match(/@font-face/g)?.length).toBe(2);
  expect(slimmed).toContain('inter-latin-wght-normal.woff2');
  expect(slimmed).toContain('inter-latin-ext-wght-normal.woff2');
  // 源 css 的子集注释头会残留（构建压缩自会移除），断言以字体文件引用为准
  for (const subset of ['cyrillic-ext', 'cyrillic', 'greek-ext', 'greek', 'vietnamese']) {
    expect(slimmed).not.toContain(`inter-${subset}-wght-normal.woff2`);
  }
});

test('无关 css 模块与已无变化的内容返回 null', () => {
  expect(slimCssForId('body{color:red}', '/x/src/styles.css')).toBeNull();
  // katex 路径但内容无降级段：不变即 null
  expect(slimCssForId('a{b:c}', '/x/node_modules/katex/dist/katex.min.css')).toBeNull();
  // 带 query 的 id 也能命中
  const css = readFileSync(resolvePackageFile('@fontsource-variable/inter/index.css'), 'utf8');
  expect(
    slimCssForId(css, '/x/node_modules/@fontsource-variable/inter/index.css?direct'),
  ).not.toBeNull();
});

test('插件 transform 委托 slimCssForId：命中返回替换结果，未命中返回 null', () => {
  const plugin = slimFontsPlugin();
  expect(plugin.enforce).toBe('pre');
  if (plugin.transform === undefined) throw new Error('plugin.transform missing');

  const untouched = plugin.transform.call({} as never, 'body{color:red}', '/x/src/a.css');
  expect(untouched).toBeNull();

  const katexCss = readFileSync(resolvePackageFile('katex/dist/katex.min.css'), 'utf8');
  const slimmed = plugin.transform.call({} as never, katexCss, '/x/katex/dist/katex.min.css');
  if (slimmed === null) throw new Error('transform returned null for katex css');
  expect(slimmed.code).not.toContain('.ttf');
});
