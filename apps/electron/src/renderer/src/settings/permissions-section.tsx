import * as React from 'react';

import type { PermMode, ThinkingLevel } from '@paiapp/contracts';
import { THINKING_LEVEL_ORDER, currentPermModes, thinkingLevelLabel } from '@paiapp/contracts';
import { SegmentedControl, type SegmentedControlOption } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

type PermissionsSectionProps = {
  /** hub 用户级缺省（app/hubSettings；null = 未加载）。 */
  hubSettings: { permissionDefaultMode: PermMode | null; thinkingDefault: ThinkingLevel | null } | null
  /** 缺省写入（app/setHubSettings；null = 不修改该键）。 */
  onSaveDefaults: (patch: { permissionDefaultMode?: PermMode | null; thinkingDefault?: ThinkingLevel | null }) => Promise<boolean>
}

type SaveStatus = 'failed' | null;

/**
 * Permissions 分区：hub 用户级缺省（默认权限模式 + 默认思考档）两档分段即改即存。
 * 「未设置」在 hub 侧无协议表达（settings/set 无删除语义），无缺省时无高亮段、
 * 也不提供清除选项；规则域（patterns/sidecar）已随后端替换退役——会话内模式切换走 permission/setMode。
 */
function PermissionsSection({ hubSettings, onSaveDefaults }: PermissionsSectionProps) {
  const [status, setStatus] = React.useState<SaveStatus>(null);

  const save = async (patch: { permissionDefaultMode?: PermMode | null; thinkingDefault?: ThinkingLevel | null }): Promise<void> => {
    setStatus(null);
    const ok = await onSaveDefaults(patch);
    if (!ok) setStatus('failed');
  };

  if (hubSettings === null) {
    return (
      <section>
        <SettingsPageHeader title={copy.settings.permissionsTitle} description={copy.settings.permissionsDesc} />
        <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.permissionsLoading}</p>
      </section>
    );
  }

  /** 选项类型含空串：无缺省（null）时传入 ''，无匹配段即无高亮（hub 无清除语义，不设清除选项）。
   *  选项面 = host 词表（permission/get_mode modes 收敛；host 缺席回落内置缺省）；
   *  文案未收录档回退 id 本身——新档可见可选，不崩。 */
  const modeOptions: ReadonlyArray<SegmentedControlOption<PermMode>> = currentPermModes().map((mode) => ({
    value: mode,
    label: copy.settings.permModeOptions[mode] ?? mode,
  }));
  const thinkingOptions: ReadonlyArray<SegmentedControlOption<ThinkingLevel | ''>> = THINKING_LEVEL_ORDER.map((level) => ({
    value: level as ThinkingLevel | '',
    label: thinkingLevelLabel(level),
  }));

  return (
    <section>
      <SettingsPageHeader title={copy.settings.permissionsTitle} description={copy.settings.permissionsDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.permissionsDefaultMode} description={copy.settings.permissionsDefaultModeHint}>
            <SegmentedControl
              aria-label={copy.settings.permissionsDefaultMode}
              options={modeOptions}
              value={hubSettings.permissionDefaultMode ?? ''}
              onChange={(next) => {
                // '' 只是空值占位（无匹配段），选项面不含它、不可能被选中发出
                if (next !== '') void save({ permissionDefaultMode: next });
              }}
            />
          </SettingsRow>
          <SettingsRow title={copy.settings.permissionsDefaultThinking} description={copy.settings.permissionsDefaultThinkingHint}>
            <SegmentedControl
              aria-label={copy.settings.permissionsDefaultThinking}
              options={thinkingOptions}
              value={hubSettings.thinkingDefault ?? ''}
              onChange={(next) => {
                if (next !== '') void save({ thinkingDefault: next });
              }}
            />
          </SettingsRow>
        </SettingsCard>
        {status === 'failed' ? <p className="text-[12px] leading-[16px] text-destructive">{copy.settings.permissionSaveFailed}</p> : null}
      </div>
    </section>
  );
}

export { PermissionsSection };
