import * as React from 'react';
import { View } from 'react-native';

import { groupEditsByFile, type FileDiffGroup } from '@paiapp/ui-thread';

import type { ChatMessage } from '@/types/domain';
import { toolViewOf } from '@/features/chat/tool-message';
import { FileDiffRow } from '@/features/chat/file-diff-row';

type FileDiffSectionProps = {
  /** 批次内的消息（编辑类调用携带 editHunks；其余忽略） */
  messages: readonly ChatMessage[];
  onOpen: (group: FileDiffGroup) => void;
};

/**
 * 文件级 diff 入口区（与 PC 端 FileDiffSection 同语义）：同一文件的多次编辑
 * 归并成一个入口（一个文件一个 diff，GitHub 形态），点按进底部 Sheet 看对照。
 *
 * **只收成功调用的补丁**：片段派生自工具入参（调用一到就有了），与执行结果
 * 无关。不按 status 过滤的话，运行中会同时出现「正在编辑 src/a.ts」（行前缀）
 * 与「已编辑 a.ts」（diff 入口），失败时更会挂一份看起来改成功了的 diff——
 * 这里展示的必须是「已改成的」，不是「想改的」。
 */
export function FileDiffSection({ messages, onOpen }: FileDiffSectionProps) {
  const groups = React.useMemo(
    () => groupEditsByFile(messages.map(toolViewOf).filter((view) => view.status === 'ok')),
    [messages],
  );
  if (groups.length === 0) return null;
  return (
    <View>
      {groups.map((group, index) => (
        <FileDiffRow key={`${group.path}-${index}`} group={group} onOpen={onOpen} />
      ))}
    </View>
  );
}
