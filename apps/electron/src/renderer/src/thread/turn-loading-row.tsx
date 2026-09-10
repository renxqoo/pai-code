type TurnLoadingRowProps = {
  /** 无障碍标签（执行中状态词）；视觉本体是同词的波纹文字 */
  label: string
}

/** 对话执行中底部指示：波纹文字（与工具行/思考行/轮次计时同一加载态）。
 * 显隐由调用方以线程在途态驱动（轮次流式/直执行命令/压缩），
 * 清除面跟随 store 折叠（settle / worker 死亡 / 宿主重启均已就地终态）。 */
function TurnLoadingRow({ label }: TurnLoadingRowProps) {
  return (
    <div role="status" aria-label={label} className="flex items-center pt-[20px]">
      <span aria-hidden="true" className="shimmer-text text-[12.5px] leading-[20px] font-medium">
        {label}
      </span>
    </div>
  );
}

export { TurnLoadingRow };
