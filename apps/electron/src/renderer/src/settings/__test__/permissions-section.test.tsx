import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PermMode, ThinkingLevel } from '@paiapp/contracts';
import { copy } from '@/strings';
import { PermissionsSection } from '../permissions-section';

/**
 * Permissions 分区渲染：无「清除缺省」选项（hub 无未设置协议表达）；
 * null 缺省无高亮段，已设缺省高亮对应段。
 */

function render(hubSettings: { permissionDefaultMode: PermMode | null; thinkingDefault: ThinkingLevel | null }): string {
  return renderToStaticMarkup(
    <PermissionsSection
      hubSettings={hubSettings}
      onSaveDefaults={() => Promise.resolve(true)}
    />,
  );
}

describe('PermissionsSection', () => {
  test('无缺省（null）：全部段不选中；无清除选项（选项面 = 词表本身）', () => {
    const html = render({ permissionDefaultMode: null, thinkingDefault: null });
    expect(html).not.toContain('aria-checked="true"');
    // 两行各 4 段（perm 词表 + thinking 词表），无额外「缺省」段
    expect(html.match(/role="radio"/g) ?? []).toHaveLength(8);
  });

  test('已设缺省：对应段选中', () => {
    const html = render({ permissionDefaultMode: 'auto', thinkingDefault: 'high' });
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(copy.settings.permModeOptions.auto);
  });

  test('未加载（hubSettings null）：加载占位', () => {
    const html = renderToStaticMarkup(
      <PermissionsSection hubSettings={null} onSaveDefaults={() => Promise.resolve(true)} />,
    );
    expect(html).toContain(copy.settings.permissionsLoading);
  });
});
