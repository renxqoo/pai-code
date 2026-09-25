import { describe, expect, test } from 'bun:test';

import { PermissionModeMenu } from '../permission-mode-menu';
import { render } from '@/testing/render';
import { copy } from '@/strings';

/**
 * 会话权限模式下拉（静态面）：选项面数据源 = modes prop——host 词表随读口数据走
 * （读口响应的 modes 字段经 store 传入，组件零本地模块状态）。症状回归背景：词表曾住
 * 在模块级变量且主/渲染进程各自一份，host 扩档后 UI 选项面永远显示内置档。
 * 菜单开合/点选交互在 happy-dom 下不驱动（base-ui 弹层依赖真布局），按 AGENTS.md
 * UI 测试纪律走 bw 真机走查。
 */

describe('PermissionModeMenu', () => {
  test('触发器展示名：词表内档查双语词表', () => {
    const page = render(<PermissionModeMenu mode="auto" modes={['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']} onSelectMode={() => undefined} />);
    expect(page.container.textContent).toContain(copy.settings.permModeOptions.auto);
    page.unmount();
  });

  test('症状回归：词表外档（host 扩档当前值）回退 id 本身——可见不崩', () => {
    const page = render(<PermissionModeMenu mode="future-mode" modes={['auto', 'future-mode']} onSelectMode={() => undefined} />);
    expect(page.container.textContent).toContain('future-mode');
    page.unmount();
  });
});
