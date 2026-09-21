import * as React from 'react';
import { Check } from 'lucide-react';

import { copy } from '@/strings';
import { ProviderEditor, type ProviderUpsertInput } from '@/settings/provider-editor';
import type { ProviderConfigView } from '@paiapp/contracts';

export type OnboardingScreenProps = {
  providers: readonly ProviderConfigView[]
  /** "provider/modelId" 形的可选默认模型 */
  modelOptions: readonly string[]
  onUpsertProvider: (input: ProviderUpsertInput) => Promise<string | null>
  onSelectDefaultModel: (value: string | null) => void
  onRefreshModels: () => void
  /** 完成引导；cwd 非空时调用方负责用它开首个会话 */
  onFinish: (cwd: string) => void
  /** 跳过全部（也算完成） */
  onSkip: () => void
};

const stepOrder = ['provider', 'model', 'cwd'] as const;
type OnboardingStep = (typeof stepOrder)[number];

const primaryButtonClassName =
  'h-[30px] cursor-pointer rounded-[8px] bg-foreground px-[14px] text-[12px] font-medium text-background outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/50';

const textButtonClassName =
  'cursor-pointer text-[11.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

const stepTitleClassName = 'text-[12.5px] font-medium';

const cardRowBaseClassName =
  'flex w-full cursor-pointer items-center gap-[10px] rounded-[10px] border px-[12px] py-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

/** 模型行：选中反白高亮，未选中悬停轻提示。 */
function modelRowClassName(selected: boolean): string {
  const tone = selected
    ? 'border-foreground/40 bg-muted/60'
    : 'border-border hover:border-foreground/25 hover:bg-muted/40';
  return `${cardRowBaseClassName} ${tone}`;
}

const configuredProviderRowClassName = 'rounded-[10px] border border-border px-[12px] py-[10px]';

const cwdFieldClassName =
  'h-[34px] w-full rounded-[10px] border border-border bg-background px-[12px] font-mono text-[12px] outline-none focus:border-foreground/25';

/** 首次启动引导：provider → 默认模型 → 工作目录三步，任意时刻可跳过；全部事实由调用方持有，本组件只做采集与提交。 */
function OnboardingScreen({
  providers,
  modelOptions,
  onUpsertProvider,
  onSelectDefaultModel,
  onRefreshModels,
  onFinish,
  onSkip,
}: OnboardingScreenProps) {
  const [step, setStep] = React.useState<OnboardingStep>('provider');
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [cwd, setCwd] = React.useState('');

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-h-full w-[480px] flex-col">
        <div className="shrink-0 pb-[28px] text-center">
          <p className="text-[16px] font-medium">{copy.onboarding.title}</p>
          <p className="pt-[6px] text-[12.5px] leading-[19px] text-muted-foreground">{copy.onboarding.hint}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 'provider' ? (
            <div className="flex flex-col gap-[12px]">
              <p className={stepTitleClassName}>{copy.onboarding.stepProvider}</p>
              <ProviderEditor initial={null} onSubmit={onUpsertProvider} />
              {providers.length > 0 ? (
                <div className="flex flex-col gap-[8px]">
                  {providers.map((provider) => (
                    <div key={provider.name} className={configuredProviderRowClassName}>
                      <p className="truncate text-[12.5px] font-medium">{provider.name}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">{provider.baseUrl}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {provider.models.map((model) => model.id).join(', ')} · {provider.hasKey ? copy.settings.keyPresent : copy.settings.keyMissing}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <button type="button" onClick={() => setStep('model')} className={primaryButtonClassName}>
                  {copy.onboarding.next}
                </button>
              </div>
            </div>
          ) : step === 'model' ? (
            <div className="flex flex-col gap-[12px]">
              <p className={stepTitleClassName}>{copy.onboarding.stepModel}</p>
              {modelOptions.length === 0 ? (
                <div className="flex items-center gap-[14px]">
                  <p className="text-[12.5px] text-muted-foreground">{copy.onboarding.noModelsYet}</p>
                  <button type="button" onClick={onRefreshModels} className={textButtonClassName}>
                    {copy.onboarding.refreshModels}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-[8px]">
                  {modelOptions.map((option) => {
                    const selected = option === selectedModel;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedModel(option);
                          onSelectDefaultModel(option);
                        }}
                        className={modelRowClassName(selected)}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{option}</span>
                        {selected ? <Check className="size-[13px] shrink-0" strokeWidth={2.5} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-[14px]">
                <button type="button" onClick={() => setStep('provider')} className={textButtonClassName}>
                  {copy.onboarding.back}
                </button>
                <button type="button" onClick={() => setStep('cwd')} className={primaryButtonClassName}>
                  {copy.onboarding.next}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onFinish(cwd.trim());
              }}
              className="flex flex-col gap-[12px]"
            >
              <p className={stepTitleClassName}>{copy.onboarding.stepCwd}</p>
              <input
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder={copy.onboarding.cwdField}
                autoFocus
                className={cwdFieldClassName}
              />
              <div className="flex items-center gap-[14px]">
                <button type="button" onClick={() => setStep('model')} className={textButtonClassName}>
                  {copy.onboarding.back}
                </button>
                <button type="submit" className={primaryButtonClassName}>
                  {copy.onboarding.finish}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between pt-[24px]">
          <div aria-hidden="true" className="flex items-center gap-[6px]">
            {stepOrder.map((item) => (
              <span
                key={item}
                className={`size-[6px] rounded-full ${item === step ? 'bg-foreground' : 'bg-border'}`}
              />
            ))}
          </div>
          <button type="button" onClick={onSkip} className={textButtonClassName}>
            {copy.onboarding.skip}
          </button>
        </div>
      </div>
    </div>
  );
}

export { OnboardingScreen };
