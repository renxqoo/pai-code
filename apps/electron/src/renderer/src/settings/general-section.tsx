import * as React from 'react';

import { copy } from '@/strings';

/** host 启动覆盖路径（bun 二进制与 hub 入口；null = 使用内置默认）。 */
type HubDevPaths = {
  bunPath: string | null
  hubEntry: string | null
}

type GeneralSectionProps = {
  trustedDefault: boolean
  hubDev: HubDevPaths
  language: 'zh' | 'en'
  onSave: (patch: { trustedDefault?: boolean; hubDev?: HubDevPaths }) => Promise<boolean>
  onLanguageChange: (language: 'zh' | 'en') => void
}

type SaveStatus = 'saved' | 'failed' | null

// 语言名以各自语言呈现是惯例，不进文案表
const LANGUAGE_OPTIONS: ReadonlyArray<{ value: 'zh' | 'en'; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

/** 路径输入归一：空白输入 = 清除（存 null），其余 trim。 */
function normalizePath(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** General 分区：界面语言单选卡（即选即换）+ 受信缺省开关 + host 路径覆盖，保存只提交变化字段。 */
function GeneralSection({ trustedDefault, hubDev, language, onSave, onLanguageChange }: GeneralSectionProps) {
  const [draftTrusted, setDraftTrusted] = React.useState(trustedDefault);
  const [draftBunPath, setDraftBunPath] = React.useState(hubDev.bunPath ?? '');
  const [draftHubEntry, setDraftHubEntry] = React.useState(hubDev.hubEntry ?? '');
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<SaveStatus>(null);

  // 初值变化（保存写回 / 外部刷新）→ 草稿同步
  React.useEffect(() => {
    setDraftTrusted(trustedDefault);
    setDraftBunPath(hubDev.bunPath ?? '');
    setDraftHubEntry(hubDev.hubEntry ?? '');
    setStatus(null);
  }, [trustedDefault, hubDev.bunPath, hubDev.hubEntry]);

  const nextBunPath = normalizePath(draftBunPath);
  const nextHubEntry = normalizePath(draftHubEntry);
  const dirty = draftTrusted !== trustedDefault || nextBunPath !== hubDev.bunPath || nextHubEntry !== hubDev.hubEntry;

  const submit = async (): Promise<void> => {
    if (saving || !dirty) return;
    setStatus(null);
    const patch: { trustedDefault?: boolean; hubDev?: HubDevPaths } = {};
    if (draftTrusted !== trustedDefault) patch.trustedDefault = draftTrusted;
    if (nextBunPath !== hubDev.bunPath || nextHubEntry !== hubDev.hubEntry) {
      patch.hubDev = { bunPath: nextBunPath, hubEntry: nextHubEntry };
    }
    setSaving(true);
    const ok = await onSave(patch);
    setSaving(false);
    setStatus(ok ? 'saved' : 'failed');
  };

  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.generalTitle}</p>
      <div className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <p className="text-[11.5px] text-muted-foreground">{copy.settings.generalLanguage}</p>
          <div className="flex items-center gap-[8px]">
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = language === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onLanguageChange(option.value)}
                  className={`cursor-pointer rounded-[8px] border px-[12px] py-[6px] text-[12px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    selected
                      ? 'border-foreground/40 bg-muted/60 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="flex w-fit cursor-pointer items-center gap-[8px] select-none">
            <input
              type="checkbox"
              checked={draftTrusted}
              onChange={(event) => setDraftTrusted(event.target.checked)}
              className="size-[14px] shrink-0 cursor-pointer accent-foreground"
            />
            <span className="text-[12px] leading-[16px] text-foreground/85">{copy.settings.generalTrustedDefault}</span>
          </label>
          <p className="text-[11px] leading-[16px] text-muted-foreground">{copy.settings.generalTrustedHint}</p>
        </div>
        <div className="flex flex-col gap-[8px]">
          <input
            value={draftBunPath}
            onChange={(event) => setDraftBunPath(event.target.value)}
            placeholder={copy.settings.generalBunPath}
            spellCheck={false}
            className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] font-mono text-[12px] outline-none placeholder:text-muted-foreground focus:border-foreground/25"
          />
          <input
            value={draftHubEntry}
            onChange={(event) => setDraftHubEntry(event.target.value)}
            placeholder={copy.settings.generalHubEntry}
            spellCheck={false}
            className="h-[30px] rounded-[8px] border border-border bg-background px-[10px] font-mono text-[12px] outline-none placeholder:text-muted-foreground focus:border-foreground/25"
          />
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
