type SettingsSectionNavProps = {
  ariaLabel: string
  items: ReadonlyArray<{ id: string; label: string; selected: boolean; onSelect: () => void }>
}

/** 设置分区导航：垂直按钮列，选中项左侧 2px 强调条 + 高亮。 */
function SettingsSectionNav({ ariaLabel, items }: SettingsSectionNavProps) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-[2px] px-[12px] pb-[12px] pt-[6px]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.selected ? 'true' : undefined}
          data-selected={item.selected ? 'true' : 'false'}
          onClick={item.onSelect}
          className="relative rounded-[8px] py-[7px] pl-[14px] pr-[10px] text-left text-[12.5px] leading-none outline-none select-none before:absolute before:top-1/2 before:left-0 before:h-[14px] before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-foreground before:opacity-0 data-[selected=true]:bg-accent data-[selected=true]:text-foreground data-[selected=true]:before:opacity-100 data-[selected=false]:text-muted-foreground data-[selected=false]:hover:bg-accent/50 data-[selected=false]:hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export { SettingsSectionNav };
