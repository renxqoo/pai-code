import * as React from 'react';

import { copy } from '@/strings';

type GeneralSectionProps = {
  trustedDefault: boolean
  language: 'zh' | 'en'
  onSave: (patch: { trustedDefault?: boolean }) => Promise<boolean>
  onLanguageChange: (language: 'zh' | 'en') => void
}

/**
 * 通用分区（J2）：界面语言（即时生效，根级重挂载）+ 新项目受信缺省。
 * 宿主路径（hubDev）不提供 UI 编辑：该字段控制主进程 spawn 目标，
 * 用户可写通路只有 settings.json 文件与环境变量；开发态另有同级 hub 检出自动探测
 * （hub-paths.ts 解析链），不构成用户输入面（第三波审查 P0 处置延续）。
 */
function GeneralSection({ trustedDefault, language, onSave, onLanguageChange }: GeneralSectionProps) {
  const [draftTrusted, setDraftTrusted] = React.useState(trustedDefault);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<'saved' | 'failed' | null>(null);

  React.useEffect(() => {
    setDraftTrusted(trustedDefault);
    setStatus(null);
  }, [trustedDefault]);

  const dirty = draftTrusted !== trustedDefault;

  const submit = async (): Promise<void> => {
    if (saving || !dirty) return;
    setSaving(true);
    setStatus(null);
    const ok = await onSave({ trustedDefault: draftTrusted });
    setSaving(false);
    setStatus(ok ? 'saved' : 'failed');
  };

  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {copy.settings.generalTitle}
      </p>
      <div className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <p className="text-[11.5px] text-muted-foreground">{copy.settings.generalLanguage}</p>
          <div className="flex items-center gap-[8px]">
            {(['zh', 'en'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={language === value}
                onClick={() => onLanguageChange(value)}
                className={`cursor-pointer rounded-[8px] border px-[12px] py-[6px] text-[12px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  language === value
                    ? 'border-foreground/40 bg-muted/60 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                {value === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="flex cursor-pointer items-center gap-[8px] text-[12px] text-foreground">
            <input
              type="checkbox"
              checked={draftTrusted}
              onChange={(event) => setDraftTrusted(event.target.checked)}
              className="size-[14px] accent-foreground"
            />
            {copy.settings.generalTrustedDefault}
          </label>
          <p className="text-[11px] leading-[16px] text-muted-foreground">{copy.settings.generalTrustedHint}</p>
        </div>
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !dirty}
            className="h-[30px] rounded-[8px] bg-foreground px-[14px] text-[12px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.settings.generalSave}
          </button>
          {status === 'saved' ? <p className="text-[11.5px] text-muted-foreground">{copy.settings.generalSaved}</p> : null}
          {status === 'failed' ? <p className="text-[11.5px] text-red-600">{copy.settings.generalSaveFailed}</p> : null}
        </div>
      </div>
    </section>
  );
}

export { GeneralSection };
