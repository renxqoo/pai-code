import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { greetingKeyOf } from '@/lib/greeting';
import { greetingTexts } from '@/screens/new-task-view-model';
import { copy } from '@/strings';

import { NewTaskScreen } from '../new-task-screen';

/**
 * 新建任务整页冒烟（仓库静态口径：SSR 不跑 effect，分支视图恒为「在途/空」态；
 * 弹窗交互与分支切换走真机走查 + 路由级真 git 集成）。
 */
function renderScreen(overrides: Partial<Parameters<typeof NewTaskScreen>[0]> = {}): string {
  return renderToStaticMarkup(
    <NewTaskScreen
      knownDirs={['/w/app', '/w/cli']}
      defaultCwd="/w/app"
      trustedDefault={false}
      defaultModelFor={() => 'glm/glm-4.7'}
      modelOptions={['glm/glm-4.7', 'glm/glm-5.3']}
      noModelsLabel={copy.composer.noModels}
      globalPermissionMode="ask"
      onSearchFiles={() => Promise.resolve(null)}
      onListBranches={() => Promise.resolve({ ok: true, data: { isRepo: true, current: 'main', branches: ['main'] } })}
      onCheckoutBranch={() => Promise.resolve({ ok: true, data: { branch: 'main' } })}
      onPickDirectory={() => Promise.resolve(null)}
      onCreate={() => Promise.resolve(true)}
      onClose={() => undefined}
      onNotify={() => undefined}
      onDialogOpenChange={() => undefined}
      {...overrides}
    />,
  );
}

describe('NewTaskScreen', () => {
  test('问候语按时段 + 占位文案 + 四条快捷胶囊', () => {
    const html = renderScreen();
    expect(html).toContain(greetingTexts(greetingKeyOf(new Date().getHours())).title);
    expect(html).toContain(copy.newTask.placeholder);
    for (const label of copy.newTask.quickTasks) expect(html).toContain(label);
  });

  test('上下文条：项目段显示目录名、分支段在途给加载文案（SSR 不跑 effect）', () => {
    const html = renderScreen();
    expect(html).toContain('aria-label="工作目录"');
    expect(html).toContain('>app<');
    expect(html).toContain(copy.composer.branchLoading);
  });

  test('无会话面控件：不渲染思考档/压缩/用量环（不摆没有数据面的假控件）', () => {
    const html = renderScreen();
    expect(html).not.toContain(copy.composer.effortUnavailable);
    expect(html).not.toContain(copy.composer.compact);
    expect(html).not.toContain(copy.composer.contextUsage);
    // 附件与发送保留（可附图提交）
    expect(html).toContain(copy.composer.attach);
    expect(html).toContain(copy.composer.send);
  });

  test('权限模式控件渲染全局模式（跟随全局 = 不可再点跟随项由菜单内呈现）', () => {
    const html = renderScreen();
    expect(html).toContain(copy.settings.permissionsModeAsk);
  });

  test('全局规则未加载（null）：不渲染权限控件', () => {
    const html = renderScreen({ globalPermissionMode: null });
    expect(html).not.toContain(copy.settings.permissionsModeAsk);
  });

  test('无预选目录：只渲染「选择工作区」入口，不渲染分支段（未选目录不是「分支不可用」）', () => {
    const html = renderScreen({ defaultCwd: '', knownDirs: [] });
    expect(html).toContain(copy.newTask.workspacePickerTitle);
    expect(html).not.toContain(copy.composer.branchUnavailable);
    expect(html).not.toContain(copy.composer.branchLoading);
    expect(html).toContain(copy.newTask.placeholder);
  });
});
