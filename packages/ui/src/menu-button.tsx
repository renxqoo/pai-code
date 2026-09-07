import type { CSSProperties, ReactNode } from 'react'

import { Menu } from '@base-ui/react/menu'

import { menuItemClassName, menuPopupClassName } from './menu-styles'

export type MenuItemDef =
  | { kind: 'item'; id: string; label: string; disabled?: boolean; selected?: boolean }
  | { kind: 'separator' }

type MenuButtonProps = {
  /** 触发器内容（图标、文案或组合） */
  trigger: ReactNode
  triggerClassName?: string
  items: readonly MenuItemDef[]
  onSelect?: (id: string) => void
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  /** 弹层最小宽度（px） */
  popupMinWidth?: number
  'aria-label'?: string
}

function MenuButton({
  trigger,
  triggerClassName,
  items,
  onSelect,
  align = 'start',
  sideOffset = 6,
  popupMinWidth = 176,
  'aria-label': ariaLabel,
}: MenuButtonProps) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={ariaLabel} className={triggerClassName}>
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
          <Menu.Popup style={{ minWidth: popupMinWidth } satisfies CSSProperties} className={menuPopupClassName}>
            {items.map((item, index) =>
              item.kind === 'separator' ? (
                <div key={`separator-${index}`} role="separator" className="mx-2 my-1 h-px bg-border" />
              ) : (
                <Menu.Item
                  key={item.id}
                  disabled={item.disabled}
                  onClick={() => onSelect?.(item.id)}
                  className={menuItemClassName}
                >
                  {item.label}
                  {item.selected === true ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                    >
                      <path
                        d="M4 12.5 9.5 18 20 6.5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

export { MenuButton }
export type { MenuButtonProps }
