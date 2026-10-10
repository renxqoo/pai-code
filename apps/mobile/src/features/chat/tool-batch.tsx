import * as React from 'react';
import { View } from 'react-native';

import { toolGroupIsParallel, type FileDiffGroup } from '@x3code/ui-thread';

import type { ChatMessage } from '@/types/domain';
import { toolViewOf } from '@/features/chat/tool-message';
import { ToolRow } from '@/features/chat/tool-row';
import { ToolGroup } from '@/features/chat/tool-group';
import { FileDiffSection } from '@/features/chat/file-diff-section';

type ToolBatchProps = {
  messages: readonly ChatMessage[];
  onOpen: (message: ChatMessage) => void;
  onOpenDiff: (group: FileDiffGroup) => void;
};

/**
 * 一个执行批次（连续的工具调用）：≥2 条套可开合组头聚合展示，单调用直接
 * 一个执行单元行（无并行可言，不套壳）。两条路径都挂文件级 diff 入口
 * （同一文件的多次编辑合成一个 diff）。
 */
export function ToolBatch({ messages, onOpen, onOpenDiff }: ToolBatchProps) {
  const views = React.useMemo(() => messages.map(toolViewOf), [messages]);
  if (!toolGroupIsParallel(views)) {
    const only = messages[0];
    if (only === undefined) return null;
    return (
      <View>
        <ToolRow message={only} onOpen={onOpen} />
        <FileDiffSection messages={messages} onOpen={onOpenDiff} />
      </View>
    );
  }
  return <ToolGroup messages={messages} onOpen={onOpen} onOpenDiff={onOpenDiff} />;
}
