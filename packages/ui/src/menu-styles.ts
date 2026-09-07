/** Menu 族共用样式：弹层容器与条目，MenuButton 与 SplitButton 共享同一套外观。 */
export const menuPopupClassName =
  'z-50 box-border origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 transition-[opacity,scale] data-[starting-style]:duration-100 data-[ending-style]:duration-75';

export const menuItemClassName =
  'flex min-h-7 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1 text-[12.5px] leading-5 outline-none select-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40';
