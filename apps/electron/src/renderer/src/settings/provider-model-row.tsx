import * as React from 'react';
import { Brain, Eye, X } from 'lucide-react';

import type { ProviderModel } from '@paiapp/contracts';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type ProviderModelRowProps = {
  model: ProviderModel
  /** 切换能力声明（reasoning = 思考档位可选；vision = 图片不被剥）。 */
  onToggle: (flag: 'reasoning' | 'vision') => void
  onRemove: () => void
};

/** 能力开关按钮态：已声明=实心前景色，未声明=弱化（点击切换）。 */
function capabilityClassName(active: boolean): string {
  return cn(
    'flex size-7 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
    active ? 'text-foreground' : 'text-muted-foreground/40',
  );
}

/** 模型行：id + 思考/视觉能力开关 + 移除。 */
function ProviderModelRow({ model, onToggle, onRemove }: ProviderModelRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[8px] rounded-lg border border-border bg-background px-[10px] py-[6px]">
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] leading-[18px] text-foreground">{model.id}</span>
      <button
        type="button"
        aria-pressed={model.reasoning}
        aria-label={model.reasoning ? copy.settings.modelThinkingOn : copy.settings.modelThinkingOff}
        title={model.reasoning ? copy.settings.modelThinkingOn : copy.settings.modelThinkingOff}
        onClick={() => onToggle('reasoning')}
        className={capabilityClassName(model.reasoning)}
      >
        <Brain className="size-[14px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-pressed={model.vision}
        aria-label={model.vision ? copy.settings.modelVisionOn : copy.settings.modelVisionOff}
        title={model.vision ? copy.settings.modelVisionOn : copy.settings.modelVisionOff}
        onClick={() => onToggle('vision')}
        className={capabilityClassName(model.vision)}
      >
        <Eye className="size-[14px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={copy.settings.providerModelRemove}
        title={copy.settings.providerModelRemove}
        onClick={onRemove}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-[14px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export { ProviderModelRow };
