import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PERM_MODES, type ThinkingLevel } from '@paiapp/contracts';
import { copy } from '@/strings';
import { PermissionsSection } from '../permissions-section';

/**
 * Permissions 分区渲染：无「清除缺省」选项（hub 无未设置协议表达）；
 * null 缺省无高亮段，已设缺省高亮对应段。选项面 = hubSettings.permissionModes
 * （host 词表随读口数据走，不靠任何本地模块状态）。
 */

type HubSettingsFixture = { permissionDefaultMode: string | null; thinkingDefault: ThinkingLevel | null; permissionModes: readonly string[] };

function render(hubSettings: HubSettingsFixture): string {
  return renderToStaticMarkup(
    <PermissionsSection
      hubSettings={hubSettings}
      onSaveDefaults={() => Promise.resolve(true)}
    />,
  );
}

describe('PermissionsSection', () => {
  test('无缺省（null）：全部段不选中；无清除选项（选项面 = host 词表本身）', () => {
    const html = render({ permissionDefaultMode: null, thinkingDefault: null, permissionModes: PERM_MODES });
    expect(html).not.toContain('aria-checked="true"');
    // 两行各 N 段（perm 词表 5 档 + thinking 词表 5 档），无额外「缺省」段
    expect(html.match(/role="radio"/g) ?? []).toHaveLength(10);
  });

  test('已设缺省：对应段选中', () => {
    const html = render({ permissionDefaultMode: 'auto', thinkingDefault: 'high', permissionModes: PERM_MODES });
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(copy.settings.permModeOptions.auto);
  });

  test('症状回归：host 扩档（permissionModes 回传新档）选项面即出新档——不靠本地模块状态', () => {
    const html = render({ permissionDefaultMode: null, thinkingDefault: null, permissionModes: [...PERM_MODES, 'future-mode'] });
    // 新档段可见（文案未收录档回退 id 本身）
    expect(html).toContain('future-mode');
    expect(html.match(/role="radio"/g) ?? []).toHaveLength(11);
  });

  test('未加载（hubSettings null）：加载占位', () => {
    const html = renderToStaticMarkup(
      <PermissionsSection hubSettings={null} onSaveDefaults={() => Promise.resolve(true)} />,
    );
    expect(html).toContain(copy.settings.permissionsLoading);
  });
});
