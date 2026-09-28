import { expect, test } from 'bun:test';

import { failOnUnresolvedImportsPlugin, findUnresolvedImportStubs } from '../vite-plugin-fail-on-unresolved';

/**
 * 回归：vite 对解析不到的导入静默生成「求值即 throw」的桩模块——ws 可选依赖
 * bufferutil/utf-8-validate 曾以此形态打进主进程产物，App 启动即崩
 * （Could not resolve "bufferutil" imported by "ws". Is it installed?），
 * 而构建门禁零告警全绿。守门插件必须能从产物代码识别这种桩，且不误伤
 * 业务代码里的相似文案（如 langium 的 reference 解析错误字符串）。
 */

test('主进程启动即崩（未解析导入桩）：识别压缩产物里的 throw 桩并提取依赖名', () => {
  const stubs = findUnresolvedImportStubs(
    `const xa={};throw new Error('Could not resolve "bufferutil" imported by "ws". Is it installed?');const $a=Object.freeze(xa);`,
  );
  expect(stubs).toEqual([{ specifier: 'bufferutil', importer: 'ws' }]);
});

test('主进程启动即崩（未解析导入桩）：一段代码里的多个桩全部报出', () => {
  const stubs = findUnresolvedImportStubs(
    `throw new Error('Could not resolve "bufferutil" imported by "ws". Is it installed?');` +
      `throw new Error('Could not resolve "utf-8-validate" imported by "ws". Is it installed?');`,
  );
  expect(stubs).toEqual([
    { specifier: 'bufferutil', importer: 'ws' },
    { specifier: 'utf-8-validate', importer: 'ws' },
  ]);
});

test('主进程启动即崩（未解析导入桩）：langium 等业务错误文案不误报', () => {
  const benign = [
    'throw new Error("Could not resolve reference to infix operator rule: "+t.call.rule.$refText);',
    '"Could not resolve multi-reference"',
    '"Could not resolve path: "+t',
    '"Could not resolve URI: "+t',
  ].join(';');
  expect(findUnresolvedImportStubs(benign)).toEqual([]);
});

/** 以桩产物 + 干净产物两态驱动插件 generateBundle，断言构建失败/放行 */
function runGenerateBundle(chunks: Record<string, string>): string | null {
  const errors: string[] = [];
  const plugin = failOnUnresolvedImportsPlugin();
  if (plugin.generateBundle === undefined) throw new Error('generateBundle hook missing');
  const hook = plugin.generateBundle;
  const fn = typeof hook === 'function' ? hook : hook.handler;
  void fn.call(
    { error: (message: string) => void errors.push(message) },
    {},
    Object.fromEntries(
      Object.entries(chunks).map(([name, code]) => [name, { type: 'chunk', code }]),
    ),
  );
  return errors.length > 0 ? (errors[0] ?? '') : null;
}

test('主进程启动即崩（未解析导入桩）：产物含 throw 桩时构建失败并点名依赖', () => {
  const message = runGenerateBundle({
    'main/index.js': `const xa={};throw new Error('Could not resolve "bufferutil" imported by "ws". Is it installed?');`,
    'main/other.js': 'console.log("clean")',
  });
  expect(message).toContain('unresolved imports');
  expect(message).toContain('main/index.js');
  expect(message).toContain('bufferutil');
});

test('主进程启动即崩（未解析导入桩）：干净产物构建放行', () => {
  expect(runGenerateBundle({ 'main/index.js': 'console.log("clean")' })).toBeNull();
});
