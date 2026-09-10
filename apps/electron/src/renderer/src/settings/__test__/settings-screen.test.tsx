import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { defaultPermissionRules } from '@paiapp/contracts';
import type { ProviderConfigView, SkillView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { SettingsScreen } from '../settings-screen';
import type { SettingsScreenProps } from '../use-settings-screen';

/**
 * 渲染冒烟：分组导航（三组 + 返回 + 引导入口）与常规/技能两分区产出预期 DOM；
 * 行为（分区派发/按开即读/写路径）由 use-settings-screen 与 workspace-actions 测试覆盖。
 */
function noop(): void {}
function ok(): Promise<boolean> {
  return Promise.resolve(true);
}

function makeProps(overrides: Partial<SettingsScreenProps> = {}): SettingsScreenProps {
  return {
    open: true,
    onClose: noop,
    section: 'general',
    onSelectSection: noop,
    general: {
      localeSetting: 'system',
      onLocaleSettingChange: noop,
      theme: 'system',
      onThemeChange: noop,
      trustedDefault: false,
      onSaveTrustedDefault: ok,
      onRestartOnboarding: noop,
    },
    providers: {
      list: [] as readonly ProviderConfigView[],
      defaultModel: null,
      modelOptions: [],
      onUpsert: ok,
      onRemove: ok,
      onSelectDefaultModel: noop,
      onTest: () => Promise.resolve({ ok: true as const, latencyMs: 1 }),
    },
    permissions: {
      rules: defaultPermissionRules(),
      onSave: ok,
      sessionRules: null,
      onLoadSession: noop,
      onSaveSession: () => Promise.resolve(true),
    },
    agents: { definitions: [], knownProjects: [], modelOptions: [], toolIds: [], onRefresh: noop, onSave: () => Promise.resolve(null), onRemove: () => Promise.resolve(null) },
    skills: { list: [], onToggle: ok, onRefresh: noop },
    history: {
      saved: [],
      pinned: new Set<string>(),
      projects: [],
      onTogglePin: noop,
      onReveal: noop,
      onOpenSaved: noop,
      onRefresh: noop,
    },
    ...overrides,
  };
}

const skills: readonly SkillView[] = [
  { name: 'feature-dev', description: '功能开发工作流', enabled: true, origin: 'agents' },
  { name: 'humanizer', description: null, enabled: false, origin: 'agent' },
];

describe('设置页渲染冒烟', () => {
  test('open=false 不渲染', () => {
    expect(renderToStaticMarkup(<SettingsScreen {...makeProps({ open: false })} />)).toBe('');
  });

  test('导航：三组标题 + 返回工作区 + 引导入口 + 当前分区选中标记', () => {
    const html = renderToStaticMarkup(<SettingsScreen {...makeProps()} />);
    expect(html).toContain(copy.settings.backToWorkspace);
    expect(html).toContain(copy.settings.navGroupBasics);
    expect(html).toContain(copy.settings.navGroupAgent);
    expect(html).toContain(copy.settings.navGroupData);
    expect(html).toContain(copy.settings.navOnboarding);
    expect(html).toContain('aria-current="true"');
    // 常规页大标题 + 引导卡文案
    expect(html).toContain(copy.settings.generalTitle);
    expect(html).toContain(copy.settings.onboardingCardAction);
  });

  test('技能分区：搜索框 + 技能卡（启用开关 + 关闭徽章）', () => {
    const html = renderToStaticMarkup(
      <SettingsScreen {...makeProps({ section: 'skills', skills: { list: skills, onToggle: ok, onRefresh: noop } })} />,
    );
    expect(html).toContain(copy.settings.searchSkills);
    expect(html).toContain('feature-dev');
    expect(html).toContain(copy.settings.skillToggleLabel('humanizer'));
    expect(html).toContain(copy.settings.skillDisabledHint);
  });

  test('七个分区各自渲染出大标题与特征内容', () => {
    const cases: ReadonlyArray<{ section: SettingsScreenProps['section']; marks: readonly string[] }> = [
      { section: 'general', marks: [copy.settings.generalTitle, copy.settings.onboardingCardAction] },
      { section: 'providers', marks: [copy.settings.providersTitle, copy.settings.defaultModelTitle, copy.settings.addProvider] },
      { section: 'permissions', marks: [copy.settings.permissionsTitle, copy.settings.permissionsSave] },
      { section: 'agents', marks: [copy.settings.agentsTitle, copy.settings.agentsEmpty] },
      { section: 'skills', marks: [copy.settings.skillsTitle, copy.settings.skillsEmpty] },
      { section: 'history', marks: [copy.settings.historyTitle, copy.settings.historyEmpty] },
    ];
    for (const { section, marks } of cases) {
      const html = renderToStaticMarkup(<SettingsScreen {...makeProps({ section })} />);
      for (const mark of marks) expect(html).toContain(mark);
    }
  });

  test('providers 分区：默认模型弹窗关态零渲染（有目录时也只出触发器）', () => {
    const html = renderToStaticMarkup(
      <SettingsScreen
        {...makeProps({
          section: 'providers',
          providers: {
            list: [],
            defaultModel: 'glm/glm-4.7',
            modelOptions: ['glm/glm-4.7', 'glm/glm-5.3'],
            onUpsert: ok,
            onRemove: ok,
            onSelectDefaultModel: noop,
            onTest: () => Promise.resolve({ ok: true as const, latencyMs: 1 }),
          },
        })}
      />,
    );
    expect(html).toContain('glm/glm-4.7');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain(copy.modelPicker.searchPlaceholder);
    expect(html).not.toContain(copy.modelPicker.empty);
  });
});
