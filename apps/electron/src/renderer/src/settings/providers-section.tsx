import { copy } from '@/strings';
import { ProviderForm } from './provider-form';
import { ProviderRow } from './provider-row';
import type { ProviderConfigView } from '@paiapp/contracts';

type ProvidersSectionProps = {
  providers: readonly ProviderConfigView[]
  onUpsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>
  onRemoveProvider: (name: string) => Promise<boolean>
}

/** Providers 分区：已配置 provider 列表（key 状态可见，移除需确认）+ 新增表单（key 写-only）。 */
function ProvidersSection({ providers, onUpsertProvider, onRemoveProvider }: ProvidersSectionProps) {
  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {copy.settings.providersTitle}
      </p>
      {providers.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.providersEmpty}</p> : null}
      {providers.map((provider) => (
        <ProviderRow key={provider.name} provider={provider} onRemove={onRemoveProvider} />
      ))}
      <ProviderForm onSubmit={onUpsertProvider} />
    </section>
  );
}

export { ProvidersSection };
