import * as React from 'react';

type ProcessRailIconProps = {
  children: React.ReactNode
  className?: string
}

/**
 * 过程单元图标位：行内装饰位（思考 / 并行执行组 / 单条执行行共用一个形态）。
 * 13px 图标与 12.5px 文案基线对齐，图标到文案的间距 6px——比正文段落的 8px 更紧，
 * 让一列图标读起来是一个整体而不是散落的行首装饰。
 */
function ProcessRailIcon({ children, className }: ProcessRailIconProps) {
  return (
    <span aria-hidden="true" className={`flex size-[13px] shrink-0 items-center justify-center ${className ?? ''}`.trim()}>
      {children}
    </span>
  );
}

export { ProcessRailIcon };
