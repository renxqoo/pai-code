/** agent 提案面板（plugin-runtime \u00a75 对抗审查 3d 补全）：待审提案卡——
 *  能力声明 + 内容指纹 + P2 明示确认文案（\u201c授予全部平台能力\u201d）双钮。
 *  确认走 host 内存置位（proposals.json 文件伪造不可达）；空面板零渲染。 */
import * as React from 'react';

import type { PluginProposalRow } from '@paiapp/contracts';
import { ActionButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';

type PluginProposalsPanelProps = {
  proposals: readonly PluginProposalRow[]
  onConfirm: (proposalId: string) => Promise<boolean>
  onReject: (proposalId: string) => Promise<boolean>
}

function PluginProposalsPanel({ proposals, onConfirm, onReject }: PluginProposalsPanelProps) {
  if (proposals.length === 0) return null;
  return (
    <div className="flex flex-col gap-[8px]">
      <p className="text-[13px] leading-[18px] font-medium text-foreground">{copy.settings.pluginProposalsTitle}</p>
      {proposals.map((proposal) => (
        <SettingsCard key={proposal.proposalId} data-testid="plugin-proposal-row" className="flex flex-col gap-[6px] px-[16px] py-[14px]">
          <div className="flex items-center gap-[8px]">
            <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{proposal.name}</p>
            {proposal.confirmed ? (
              <span className="shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground">{copy.settings.pluginStatusOptions.active}</span>
            ) : null}
          </div>
          {proposal.description !== '' ? <p className="text-[12px] leading-[17px] text-muted-foreground">{proposal.description}</p> : null}
          <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginProposalSource(proposal.sourcePath)}</p>
          <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginProposalCapabilities(proposal.requestedCapabilities)}</p>
          <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pluginProposalHash(proposal.sha256)}</p>
          <div className="flex items-center gap-[8px]">
            <ActionButton size="sm" variant="outline" onClick={() => { void onConfirm(proposal.proposalId); }}>
              {copy.settings.pluginProposalConfirmLabel(proposal.name)}
            </ActionButton>
            <ActionButton size="sm" variant="quiet" onClick={() => { void onReject(proposal.proposalId); }}>
              {copy.settings.pluginProposalRejectLabel(proposal.name)}
            </ActionButton>
          </div>
        </SettingsCard>
      ))}
    </div>
  );
}

export { PluginProposalsPanel };
