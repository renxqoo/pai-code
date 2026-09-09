import type { ComponentProps } from 'react'
import { LoaderIcon } from 'lucide-react'

import { cn } from 'cn'

type SpinnerProps = ComponentProps<'svg'> & {
  /** 无障碍标签：给定时输出 role="status" 供读屏播报；缺省视为装饰性图标，对读屏隐藏 */
  label?: string
}

/** 旋转加载指示：尺寸/颜色/线宽经 className 与 props 透传定制；动画尊重系统减弱动态偏好。 */
function Spinner({ label, className, ...props }: SpinnerProps) {
  return (
    <LoaderIcon
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('size-4 animate-spin motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Spinner }
export type { SpinnerProps }
