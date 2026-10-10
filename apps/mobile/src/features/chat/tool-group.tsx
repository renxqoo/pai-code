import * as React from 'react';
import { View } from 'react-native';

import { autoOpenForGroup } from '@x3code/ui-thread';

import { rhythm } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';
import type { FileDiffGroup } from '@x3code/ui-thread';
import { toolViewOf } from '@/features/chat/tool-message';
import { ToolGroupHeader } from '@/features/chat/tool-group-header';
import { ToolRow } from '@/features/chat/tool-row';
import { FileDiffSection } from '@/features/chat/file-diff-section';

type ToolGroupProps = {
  messages: readonly ChatMessage[];
  onOpen: (message: ChatMessage) => void;
  onOpenDiff: (group: FileDiffGroup) => void;
};

/**
 * 并行执行组（同批次的多个工具调用）：可开合组头聚合本批执行，展开后是
 * 各调用行 + 文件级 diff 入口。开合 = 手动意图优先于自动（与 PC 端同一套
 * 策略：只有失败自动展开——错误必须看得见；运行中与正常完成都收起为
 * 标题摘要——自动开合只认终态，开合对即闪现源）。
 */
export function ToolGroup({ messages, onOpen, onOpenDiff }: ToolGroupProps) {
  const views = React.useMemo(() => messages.map(toolViewOf), [messages]);
  const [pref, setPref] = React.useState<boolean | null>(null);
  const open = pref ?? autoOpenForGroup(views);
  return (
    <View style={{ marginTop: rhythm.rowToRow }}>
      <ToolGroupHeader views={views} open={open} onToggle={() => setPref(!open)} />
      {open ? messages.map((message) => <ToolRow key={message.id} message={message} onOpen={onOpen} />) : null}
      {open ? <FileDiffSection messages={messages} onOpen={onOpenDiff} /> : null}
    </View>
  );
}
