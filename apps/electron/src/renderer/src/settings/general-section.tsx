import { SegmentedControl, ToggleSwitch } from '@paiapp/ui';

import type { Theme } from '@/components/theme-context';
import type { LocaleSetting } from '@/strings';
import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

type GeneralSectionProps = {
  localeSetting: LocaleSetting
  onLocaleSettingChange: (next: LocaleSetting) => void
  theme: Theme
  onThemeChange: (next: Theme) => void
  trustedDefault: boolean
  onSaveTrustedDefault: (trustedDefault: boolean) => Promise<boolean>
  onRestartOnboarding: () => void
}

/** 通用分区：界面语言/外观分段即改即生效（语言切换触发 app 根重挂载）、默认信任即改即存、虚线引导卡。 */
function GeneralSection({ localeSetting, onLocaleSettingChange, theme, onThemeChange, trustedDefault, onSaveTrustedDefault, onRestartOnboarding }: GeneralSectionProps) {
  const localeOptions: ReadonlyArray<{ value: LocaleSetting; label: string }> = [
    { value: 'system', label: copy.settings.followSystem },
    // 语言自称属专有名词：各 locale 表均显示原生名，不进文案表
    { value: 'zh', label: '简体中文' },
    { value: 'en', label: 'English' },
  ];
  const appearanceOptions: ReadonlyArray<{ value: Theme; label: string }> = [
    { value: 'light', label: copy.settings.appearanceLight },
    { value: 'dark', label: copy.settings.appearanceDark },
    { value: 'system', label: copy.settings.followSystem },
  ];
  return (
    <section>
      <SettingsPageHeader title={copy.settings.generalTitle} description={copy.settings.generalDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.generalLanguage} description={copy.settings.generalLanguageHint}>
            <SegmentedControl aria-label={copy.settings.generalLanguage} options={localeOptions} value={localeSetting} onChange={onLocaleSettingChange} />
          </SettingsRow>
          <SettingsRow title={copy.settings.appearanceLabel} description={copy.settings.appearanceHint}>
            <SegmentedControl aria-label={copy.settings.appearanceLabel} options={appearanceOptions} value={theme} onChange={onThemeChange} />
          </SettingsRow>
          <SettingsRow title={copy.settings.generalTrustedDefault} description={copy.settings.generalTrustedHint}>
            <ToggleSwitch
              checked={trustedDefault}
              onCheckedChange={(next) => void onSaveTrustedDefault(next)}
              aria-label={copy.settings.generalTrustedDefault}
            />
          </SettingsRow>
        </SettingsCard>
        <div className="flex flex-col items-start gap-[8px] rounded-xl border border-dashed border-border px-[20px] py-[16px]">
          <p className="text-[13px] leading-[18px] font-medium text-foreground">{copy.settings.onboardingCardTitle}</p>
          <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.onboardingCardDesc}</p>
          <button
            type="button"
            onClick={onRestartOnboarding}
            className="mt-[6px] h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.onboardingCardAction}
          </button>
        </div>
      </div>
    </section>
  );
}

export { GeneralSection };
