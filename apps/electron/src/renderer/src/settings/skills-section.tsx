import { copy } from '@/strings';

type SkillsSectionProps = {
  skills: ReadonlyArray<{ name: string; description: string | null }>
}

/** Skills 分区：当前会话可用技能卡列表（等宽名称 + 可选描述），只读展示、无刷新动作。 */
function SkillsSection({ skills }: SkillsSectionProps) {
  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.skillsTitle}</p>
      <p className="pb-[8px] text-[11.5px] text-muted-foreground">{copy.settings.skillsHint}</p>
      {skills.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.skillsEmpty}</p> : null}
      {skills.map((skill) => (
        <div
          key={skill.name}
          className="mb-[8px] flex flex-col gap-[3px] rounded-[10px] border border-border px-[12px] py-[10px]"
        >
          <span className="min-w-0 truncate font-mono text-[12.5px] font-medium text-foreground">{skill.name}</span>
          {skill.description !== null ? (
            <p className="text-[11.5px] leading-[16px] text-muted-foreground">{skill.description}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export { SkillsSection };
