import type { ToolCopy } from '@x3code/ui-thread';

import { copy } from './index';

/**
 * 共享派生层（@x3code/ui-thread）的文案注入面：执行行前缀、组头短语的
 * 词表从 `copy.flow` 按当前 locale 取值（copy 属性访问即解析，切换语言后
 * 下一次渲染生效）。共享包不 import 任何一端的 strings，词表由这里喂入。
 */
export function toolCopy(): ToolCopy {
  return {
    groupBashPhrase: copy.flow.groupBashPhrase,
    groupListPhrase: copy.flow.groupListPhrase,
    groupEditPhrase: copy.flow.groupEditPhrase,
    groupReadPhrase: copy.flow.groupReadPhrase,
    groupSearchPhrase: copy.flow.groupSearchPhrase,
    groupSubagentPhrase: copy.flow.groupSubagentPhrase,
    groupOtherPhrase: copy.flow.groupOtherPhrase,
    groupMorePhrase: copy.flow.groupMorePhrase,
    groupPhraseJoin: copy.flow.groupPhraseJoin,
    groupCountEdit: copy.flow.groupCountEdit,
    groupCountThinking: copy.flow.groupCountThinking,
    groupCountRead: copy.flow.groupCountRead,
    groupCountSearch: copy.flow.groupCountSearch,
    groupCountList: copy.flow.groupCountList,
    groupCountBash: copy.flow.groupCountBash,
    groupCountSubagent: copy.flow.groupCountSubagent,
    groupCountOther: copy.flow.groupCountOther,
    groupCountJoin: copy.flow.groupCountJoin,
    rowDoneBash: copy.flow.rowDoneBash,
    rowDoneRead: copy.flow.rowDoneRead,
    rowDoneEdit: copy.flow.rowDoneEdit,
    rowDoneWrite: copy.flow.rowDoneWrite,
    rowDoneSearch: copy.flow.rowDoneSearch,
    rowDoneList: copy.flow.rowDoneList,
    rowDoneSubagent: copy.flow.rowDoneSubagent,
    rowDoneOther: copy.flow.rowDoneOther,
    rowFailed: copy.flow.rowFailed,
    rowStopped: copy.flow.rowStopped,
    rowFailedOther: copy.flow.rowFailedOther,
    rowStoppedOther: copy.flow.rowStoppedOther,
    rowRunningBash: copy.flow.rowRunningBash,
    rowRunningRead: copy.flow.rowRunningRead,
    rowRunningEdit: copy.flow.rowRunningEdit,
    rowRunningWrite: copy.flow.rowRunningWrite,
    rowRunningSearch: copy.flow.rowRunningSearch,
    rowRunningList: copy.flow.rowRunningList,
    rowRunningSubagent: copy.flow.rowRunningSubagent,
    rowRunningOther: copy.flow.rowRunningOther,
  };
}
