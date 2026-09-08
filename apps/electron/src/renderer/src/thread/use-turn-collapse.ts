import * as React from 'react';

import { autoOpenForTurn, resolveOpen, type CollapsePref } from './collapse-state';
import type { TurnModel } from './thread-model';

export type TurnCollapseControl = {
  /** 过程整体开合（状态行箭头）：收起 = 过程全部隐藏，只留最后一条文本输出 */
  turnOpen: boolean;
  toggleTurn: () => void;
};

/**
 * 轮次折叠状态：过程（思考/工具/子代理/diff/中间文本）作为整体由轮级开关控制，
 * 不提供块级独立开关；无手动意图时跟随轮次状态（运行中展开、结束收起）。
 */
export function useTurnCollapse(turn: Pick<TurnModel, 'status'>): TurnCollapseControl {
  const autoOpen = autoOpenForTurn(turn.status);
  const [turnPref, setTurnPref] = React.useState<CollapsePref>(null);

  const turnOpen = resolveOpen(turnPref, autoOpen);

  const toggleTurn = (): void => {
    setTurnPref(!turnOpen);
  };

  return { turnOpen, toggleTurn };
}
