type SettingsPageHeaderProps = {
  title: string
  description: string
}

/** 分区页头：大标题 + 下行描述（文案由调用方从 copy.settings 取）。 */
function SettingsPageHeader({ title, description }: SettingsPageHeaderProps) {
  return (
    <header className="flex flex-col gap-[6px] pb-[28px]">
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{description}</p>
    </header>
  );
}

export { SettingsPageHeader };
