import type { ReactNode } from 'react'

import { IconButton, type IconButtonProps } from './icon-button'

type IconBadgeProps = {
  /** 右上角数字（<= 0 不渲染徽标）。 */
  count: number
  /** 无障碍名称，同时作为原生 tooltip 文案。 */
  label: string
  onClick?: () => void
  size?: IconButtonProps['size']
  className?: string
  children: ReactNode
}

/** 图标按钮 + 右上角小数字徽标（状态计数的统一展示形态）。 */
function IconBadge({ count, label, onClick, size, className, children }: IconBadgeProps) {
  return (
    <IconButton label={label} size={size} onClick={onClick} className={className}>
      {children}
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-[3px] -right-[3px] flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-link px-[3px] font-mono text-[9px] leading-none tabular-nums text-white"
        >
          {count}
        </span>
      )}
    </IconButton>
  )
}

export { IconBadge }
export type { IconBadgeProps }
