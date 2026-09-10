import { Spinner } from '@paiapp/ui';

type TurnLoadingRowProps = {
  /** 无障碍标签（执行中状态词）；视觉本体只有旋转指示 */
  label: string
}

/** 对话执行中底部指示：旋转 loader。
 * 显隐由调用方以线程在途态驱动（轮次流式/直执行命令/压缩），
 * 清除面跟随 store 折叠（settle / worker 死亡 / 宿主重启均已就地终态）。 */
function TurnLoadingRow({ label }: TurnLoadingRowProps) {
  return (
    <div className="flex h-[20px] items-center pt-[20px]">
      <Spinner label={label} className="size-[14px] text-foreground/55" strokeWidth={1.75} />
    </div>
  );
}

export { TurnLoadingRow };
