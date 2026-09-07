import type { DemoTurnScript } from './demo-turn-script';
import type { SessionMessage, ThreadModel, TurnModel } from '@/thread/thread-model';

/**
 * 演示会话的静态剧本条目：已完结的历史内容直接给定，
 * 进行中的轮次交给时间轴脚本在观察时刻折算。
 */
export type DemoItemSpec =
  | { kind: 'message'; message: SessionMessage }
  | { kind: 'turn'; turn: TurnModel }
  | { kind: 'live-turn'; turnId: string; startedAt: number; script: DemoTurnScript };

export type DemoThreadSpec = {
  sessionId: string;
  items: readonly DemoItemSpec[];
};

export type DerivedThreads = Readonly<Record<string, ThreadModel>>;
