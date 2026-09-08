import { copy } from '@/strings';
import { ToggleSwitch } from '@paiapp/ui';
import type { SkillView } from '@paiapp/contracts';

type SkillsSectionProps = {
  skills: readonly SkillView[]
  /** 进分区时拉取（含禁用态全集，会话视角的 command/list 只见启用技能）。 */
  onRefresh: () => void
  /** 启停：写 pi settings 后重开活跃会话生效。 */
  onToggle: (name: string, enabled: boolean) => Promise<boolean>
}

/** Skills 分区：用户级技能卡（等宽名称 + 描述 + 启用开关）；关闭的技能在会话中不可用。 */
function SkillsSection({ skills, onRefresh, onToggle }: SkillsSectionProps) {
  return (
    <section>
      <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.skillsTitle}</p>
      <p className="pb-[8px] text-[11.5px] text-muted-foreground">{copy.settings.skillsHint}</p>
      <div className="flex items-center gap-[10px] pb-[10px]">
        {skills.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{copy.settings.skillsEmpty}</p> : null}
        <button type="button" onClick={onRefresh} className="cursor-pointer text-[11.5px] text-muted-foreground underline decoration-border underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          {copy.settings.skillsRefresh}
        </button>
      </div>
      {skills.map((skill) => (
        <div
          key={`${skill.origin}:${skill.name}`}
          className="mb-[8px] flex items-start justify-between gap-[10px] rounded-[10px] border border-border px-[12px] py-[10px]"
        >
          <div className="min-w-0 flex-1">
            <span className="min-w-0 truncate font-mono text-[12.5px] font-medium text-foreground">{skill.name}</span>
            {skill.description !== null ? (
              <p className="pt-[2px] text-[11.5px] leading-[16px] text-muted-foreground">{skill.description}</p>
            ) : null}
            {skill.enabled ? null : (
              <p className="pt-[2px] text-[11px] leading-[15px] text-muted-foreground/80">{copy.settings.skillDisabledHint}</p>
            )}
          </div>
          <ToggleSwitch
            checked={skill.enabled}
            onCheckedChange={(next) => void onToggle(skill.name, next)}
            aria-label={`${copy.settings.skillToggleLabel(skill.name)}`}
            className="mt-[2px]"
          />
        </div>
      ))}
    </section>
  )
}

export { SkillsSection }
