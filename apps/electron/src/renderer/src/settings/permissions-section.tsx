import * as React from 'react';

import type { PermMode, ThinkingLevel } from '@paiapp/contracts';
import { PERM_MODES, THINKING_LEVEL_ORDER, thinkingLevelLabel } from '@paiapp/contracts';
import { SegmentedControl, type SegmentedControlOption } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

type PermissionsSectionProps = {
  /** hub 用户级缺省（app/hubSettings；null = 未加载）。 */
  hubSettings: { permissionDefaultMode: PermMode | null; thinkingDefault: ThinkingLevel | null } | null
  /** 缺省写入（app/setHubSettings；null = 清除该项回落 hub 缺省）。 */
  onSaveDefaults: (patch: { permissionDefaultMode?: PermMode | null; thinkingDefault?: ThinkingLevel | null }) => Promise<boolean>
}

/** 分段控件哨兵：null（未设置）不是词表值，经哨兵进选项表。 */
const UNSET = '__unset__' as const;

type SaveStatus = 'failed' | null;

/**
 * Permissions 分区：hub 用户级缺省（默认权限模式 + 默认思考档）两档分段即改即存。
 * 规则域（patterns/sidecar）已随后端替换退役——会话内模式切换走 permission/setMode。
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

  const modeOptions: ReadonlyArray<SegmentedControlOption<PermMode | typeof UNSET>> = [
    { value: UNSET, label: copy.settings.permissionsUnset },
    ...PERM_MODES.map((mode) => ({ value: mode as PermMode | typeof UNSET, label: copy.settings.permModeOptions[mode] })),
  ];
  const thinkingOptions: ReadonlyArray<SegmentedControlOption<ThinkingLevel | typeof UNSET>> = [
    { value: UNSET, label: copy.settings.permissionsUnset },
    ...THINKING_LEVEL_ORDER.map((level) => ({ value: level as ThinkingLevel | typeof UNSET, label: thinkingLevelLabel(level) })),
  ];

  return (
    <section>
      <SettingsPageHeader title={copy.settings.permissionsTitle} description={copy.settings.permissionsDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.permissionsDefaultMode} description={copy.settings.permissionsDefaultModeHint}>
            <SegmentedControl
              aria-label={copy.settings.permissionsDefaultMode}
              options={modeOptions}
              value={hubSettings.permissionDefaultMode ?? UNSET}
              onChange={(next) => void save({ permissionDefaultMode: next === UNSET ? null : next })}
            />
          </SettingsRow>
          <SettingsRow title={copy.settings.permissionsDefaultThinking} description={copy.settings.permissionsDefaultThinkingHint}>
            <SegmentedControl
              aria-label={copy.settings.permissionsDefaultThinking}
              options={thinkingOptions}
              value={hubSettings.thinkingDefault ?? UNSET}
              onChange={(next) => void save({ thinkingDefault: next === UNSET ? null : next })}
            />
          </SettingsRow>
        </SettingsCard>
        {status === 'failed' ? <p className="text-[12px] leading-[16px] text-destructive">{copy.settings.permissionSaveFailed}</p> : null}
      </div>
    </section>
  );
}

export { PermissionsSection };
