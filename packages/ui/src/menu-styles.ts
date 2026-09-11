/** Menu 族共用样式：弹层容器与条目，MenuButton 与 SplitButton 共享同一套外观。 */
export const menuPopupClassName =
  'z-50 box-border origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 transition-[opacity,scale] data-[starting-style]:duration-100 data-[ending-style]:duration-75';

export const menuItemClassName =
  'flex min-h-7 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1 text-[12.5px] leading-5 outline-none select-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

/** 选择器观感触发器（描边胶囊 + chevron 下挂箭头）：设置页字段下拉与弹窗选择触发共用；
 * 满宽表单场景由调用方在 className 追加 w-full。 */
export const selectTriggerClassName =
  'flex h-9 cursor-pointer items-center justify-between gap-[8px] rounded-lg border border-border bg-background px-3 text-left text-[13px] text-foreground outline-none select-none hover:border-foreground/30 aria-expanded:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

/** 紧凑触发器（无边框、hover 浮起）：输入卡动作行的模型 / 思考档 / 权限模式下拉共用。 */
export const menuTriggerClassName =
  'flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 text-[12px] leading-none text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';
