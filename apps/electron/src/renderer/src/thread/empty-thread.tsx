type EmptyThreadProps = {
  title: string
  hint: string
  /** 可选重试动作（如历史加载失败）：提供时在文案下渲染重试按钮（文案经 strings）。 */
  onRetry?: () => void
  retryLabel: string
}

/** 空会话态：消息区无内容时的占位说明（flex-1 撑满内容列剩余空间，垂直居中）。 */
function EmptyThread({ title, hint, onRetry, retryLabel }: EmptyThreadProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] font-medium text-foreground/70">{title}</p>
      <p className="text-[12.5px] leading-[19px] text-muted-foreground/80">{hint}</p>
      {onRetry === undefined ? null : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-[12.5px] text-foreground/80 transition-colors hover:bg-accent"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export { EmptyThread };
