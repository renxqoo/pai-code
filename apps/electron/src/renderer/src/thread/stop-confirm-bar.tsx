import { copy } from '@/strings';

type StopConfirmBarProps = {
  onConfirm: () => void
  onCancel: () => void
}

/** 停止二次确认条（存在在途子代理时）：确认才中断（不可恢复），取消回到输入态。 */
function StopConfirmBar({ onConfirm, onCancel }: StopConfirmBarProps) {
  return (
    <div className="mx-auto mb-[8px] flex w-full max-w-[700px] items-center gap-[12px] rounded-[12px] border border-border bg-background px-[14px] py-[10px]">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-foreground">{copy.flow.stopConfirmTitle}</p>
        <p className="text-[11.5px] leading-[16px] text-muted-foreground">{copy.flow.stopConfirmHint}</p>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="h-[28px] shrink-0 rounded-[8px] bg-stop px-[12px] text-[12px] font-medium text-white hover:bg-stop/85"
      >
        {copy.flow.stopConfirmYes}
      </button>
      <button type="button" onClick={onCancel} className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground">
        {copy.flow.stopConfirmNo}
      </button>
    </div>
  );
}

export { StopConfirmBar };
