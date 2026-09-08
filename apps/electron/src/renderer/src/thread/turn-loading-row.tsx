type TurnLoadingRowProps = {
  /** 无障碍标签（执行中状态词）；视觉本体只有三点跳动 */
  label: string
}

/** 对话执行中底部指示：三点错峰跳动。显隐由调用方以线程在途态驱动（轮次流式/直执行命令/压缩），
 * 清除面跟随 store 折叠（settle / worker 死亡 / 宿主重启均已就地终态）。 */
function TurnLoadingRow({ label }: TurnLoadingRowProps) {
  return (
    <div role="status" aria-label={label} className="flex h-[20px] items-center gap-[4px] pt-[20px]">
      {[0, 120, 240].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="size-[5px] animate-bounce rounded-full bg-foreground/55"
        />
      ))}
    </div>
  );
}

export { TurnLoadingRow };
