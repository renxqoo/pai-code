type EmptyThreadProps = {
  title: string
  hint: string
}

/** 空会话态：消息区无内容时的占位说明。 */
function EmptyThread({ title, hint }: EmptyThreadProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] font-medium text-foreground/70">{title}</p>
      <p className="text-[12.5px] leading-[19px] text-muted-foreground/80">{hint}</p>
    </div>
  );
}

export { EmptyThread };
