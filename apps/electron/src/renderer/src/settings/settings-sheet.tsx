import * as React from 'react';

import { formatRelativeAge } from '@/lib/relative-age';
import { copy } from '@/strings';
import { ProviderForm } from './provider-form';
import { ProviderRow } from './provider-row';
import type { ProviderConfigView } from '@paiapp/contracts';

type SettingsSheetProps = {
  open: boolean;
  providers: readonly ProviderConfigView[];
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>;
  onClose: () => void;
  onUpsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>;
  onRemoveProvider: (name: string) => Promise<boolean>;
  onOpenSaved: (sessionPath: string) => void;
  onRefreshSaved: () => void;
};

/**
 * 设置面板：provider 配置（models.json 生成源）+ 历史会话（thread/list_saved → resume）。
 * key 输入不回显（写-only），保存即生效（主进程重生成配置，必要时重启 host）。
 */
function SettingsSheet({ open, providers, saved, onClose, onUpsertProvider, onRemoveProvider, onOpenSaved, onRefreshSaved }: SettingsSheetProps) {
  if (!open) return null;
  const now = Date.now();
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-foreground/20" onClick={onClose}>
      <div
        className="flex h-full w-[420px] flex-col border-l border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[22px] py-[18px]">
          <p className="text-[13.5px] font-medium">{copy.settings.title}</p>
          <button type="button" onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground">
            {copy.settings.close}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-[24px]">
          <section className="pb-[24px]">
            <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {copy.settings.providersTitle}
            </p>
            {providers.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.providersEmpty}</p> : null}
            {providers.map((provider) => (
              <ProviderRow key={provider.name} provider={provider} onRemove={onRemoveProvider} />
            ))}
            <ProviderForm onSubmit={onUpsertProvider} />
          </section>
          <section>
            <div className="flex items-center justify-between pb-[10px]">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.historyTitle}</p>
              <button type="button" onClick={onRefreshSaved} className="text-[11.5px] text-muted-foreground hover:text-foreground">
                {copy.settings.refresh}
              </button>
            </div>
            {saved.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{copy.settings.historyEmpty}</p> : null}
            <div className="flex flex-col gap-[6px]">
              {saved.slice(0, 40).map((session) => (
                <button
                  key={session.sessionPath}
                  type="button"
                  onClick={() => onOpenSaved(session.sessionPath)}
                  className="flex flex-col items-start gap-[3px] rounded-[10px] border border-border px-[12px] py-[9px] text-left hover:bg-muted/50"
                >
                  <span className="w-full truncate text-[12.5px] text-foreground">{session.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeAge(now, session.modifiedAt)} · {session.messageCount} msgs · {session.cwd}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export { SettingsSheet };
