import { expect, test } from 'bun:test';

import { installDom } from '../dom';

/** 装置契约：DOM 注册即钉死 locale——strings 在模块加载期解析系统语言，钉死消除 bun 路径执行序依赖（合跑假红/单跑假绿）。 */
test('installDom 后 navigator locale 钉死为 zh-CN（装置确定性）', () => {
  installDom();
  expect(navigator.language).toBe('zh-CN');
  expect(navigator.languages).toEqual(['zh-CN']);
});
