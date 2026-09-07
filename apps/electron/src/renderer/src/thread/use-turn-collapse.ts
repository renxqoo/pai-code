import * as React from 'react';

import { autoOpenForTurn, flipPref, resolveOpen, type CollapsePref } from './collapse-state';
import type { TurnModel } from './thread-model';

export type TurnCollapseControl = {
  /** 轮级开合（状态行的箭头）：completed/stopped 轮可整轮展开或收起 */
  turnOpen: boolean;
  blockOpen: (blockId: string) => boolean;
  toggleTurn: () => void;
  toggleBlock: (blockId: string) => void;
};

/**
 * 轮次折叠状态：
 * - 块级手动意图最优先，一旦用户点开，后续自动折叠不再收起它；
 * - 轮级开关是显式动作，整轮一起开合并清掉块级意图；
 * - 没有任何手动意图时跟随轮次状态（运行中展开、结束折叠）。
 */
export function useTurnCollapse(turn: Pick<TurnModel, 'status'>): TurnCollapseControl {
  const autoOpen = autoOpenForTurn(turn.status);
  const [turnPref, setTurnPref] = React.useState<CollapsePref>(null);
  const [blockPrefs, setBlockPrefs] = React.useState<Readonly<Record<string, CollapsePref>>>({});

  const turnOpen = resolveOpen(turnPref, autoOpen);

  const blockOpen = (blockId: string): boolean => {
    const pref = blockPrefs[blockId];
    return resolveOpen(pref ?? null, turnOpen);
  };

  const toggleTurn = (): void => {
    setTurnPref(!turnOpen);
    setBlockPrefs({});
  };

  const toggleBlock = (blockId: string): void => {
    setBlockPrefs((current) => {
      const pref = current[blockId];
      return { ...current, [blockId]: flipPref(pref ?? null, turnOpen) };
    });
  };

  return { turnOpen, blockOpen, toggleTurn, toggleBlock };
}
