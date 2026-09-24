import { describe, expect, test } from 'bun:test';

import type { ApiOutcome, SessionView } from '@paiapp/contracts';

import { appError } from '../../errors';
import type { SessionCommands } from '../../commands/session';
import { promptRoutes } from '../prompt';
import type { RuntimePort } from '../ports';

/**
 * 发送管线唤醒链机理（症状确认：「发送消息有时候会卡很久」卡点定位）——
 * 卡不在渲染层：submit 的等待窗 = parked 懒唤醒 resume 链 / unknown_thread
 * 重锚重投 / `! ` 直执行等待命令完成，全部发生在 session/prompt 结算之前。
 * 用例钉住各段顺序（characterization：描述现状机制，回归时红）。
 */

type PromptDeps = Parameters<typeof promptRoutes>[0];

function sessionView(threadId: string, state: SessionView['state']): SessionView {
  return {
    threadId,
    cwd: '/w',
    sessionPath: `/w/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state,
    streaming: false,
    model: 'openai/gpt-5.3',
    thinkingLevel: null,
    lastActivityAt: 0,
  };
}

/** RuntimePort 结构面假件（prompt 路由只消费 sessions/autoTitleOnPrompt）。 */
function runtimeWith(rows: SessionView[]): RuntimePort {
  return {
    sessions: () => rows,
    registry: { list: () => [] },
    defaultTitle: 'New conversation',
    sessionsRoot: '/w',
    hostPhase: () => 'ready',
    applyStartOutcome: () => rows[0] as SessionView,
    removeSession: () => undefined,
    detachSession: () => undefined,
    parkSession: () => undefined,
    renameSession: () => undefined,
    touchSession: () => undefined,
    setSessionKeepalive: () => 'ok',
    emitBuffered: () => undefined,
    markBootstrapped: () => undefined,
    autoTitleOnPrompt: () => Promise.resolve(),
    host: { restart: () => Promise.resolve() },
    hostStderrTail: () => '',
  };
}

const okPrompt = { ok: true as const, data: null };

describe('发送管线唤醒链（症状：发送消息有时卡很久——慢在结算前的唤醒/重锚段）', () => {
  test('症状：parked 懒唤醒阻塞在投递前——resume 不结算则 prompt 一次都不发，恢复后以新 id 投递', async () => {
    const order: string[] = [];
    const holder: { release: ((outcome: ApiOutcome<'session/resume'>) => void) | null } = { release: null };
    const routes = promptRoutes({
      sessionCommands: () =>
        ({
          prompt: ({ threadId }: { threadId: string }) => {
            order.push(`prompt:${threadId}`);
            return Promise.resolve(okPrompt);
          },
        }) as unknown as SessionCommands,
      fail: (error) => ({ ok: false, error }),
      runtime: runtimeWith([sessionView('t1', 'parked')]),
      bashRoute: (() => Promise.resolve(okPrompt)) as unknown as PromptDeps['bashRoute'],
      resumeRoute: () => async () => {
        order.push('resume');
        return new Promise((resolve) => {
          holder.release = resolve;
        });
      },
    });
    const pending = routes['session/prompt']({ threadId: 't1', message: 'hi' });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    // 卡点：唤醒段（session/resume 收养/换轨链）未结算前投递不发生
    expect(order).toEqual(['resume']);
    const release = holder.release as ((outcome: ApiOutcome<'session/resume'>) => void) | null;
    release?.({ ok: true, data: sessionView('t2', 'live') });
    expect(await pending).toEqual({ ok: true, data: null });
    expect(order).toEqual(['resume', 'prompt:t2']);
  });

  test('症状：unknown_thread 重锚重投——先投失败 → resume 收养 → 以新 id 恰重投一次', async () => {
    const promptCalls: string[] = [];
    const resumeCalls: string[] = [];
    let attempt = 0;
    const routes = promptRoutes({
      sessionCommands: () =>
        ({
          prompt: ({ threadId }: { threadId: string }) => {
            promptCalls.push(threadId);
            attempt += 1;
            return Promise.resolve(attempt === 1 ? { ok: false as const, error: appError('unknown_thread') } : okPrompt);
          },
        }) as unknown as SessionCommands,
      fail: (error) => ({ ok: false, error }),
      runtime: runtimeWith([sessionView('t1', 'live')]),
      bashRoute: (() => Promise.resolve(okPrompt)) as unknown as PromptDeps['bashRoute'],
      resumeRoute: () => ({ sessionPath }) => {
        resumeCalls.push(sessionPath);
        return Promise.resolve({ ok: true as const, data: sessionView('t1b', 'live') });
      },
    });
    const outcome = await routes['session/prompt']({ threadId: 't1', message: 'hi' });
    expect(outcome).toEqual({ ok: true, data: null });
    expect(resumeCalls).toEqual(['/w/s/t1.jsonl']);
    expect(promptCalls).toEqual(['t1', 't1b']);
  });

  test('症状：`! ` 直执行发送卡住——bash 命令完成前 session/prompt 不结算（24h 长命档，长命令是假卡死）', async () => {
    const holder: { release: (() => void) | null } = { release: null };
    let settled = false;
    const routes = promptRoutes({
      sessionCommands: () => ({ prompt: () => Promise.resolve(okPrompt) }) as unknown as SessionCommands,
      fail: (error) => ({ ok: false, error }),
      runtime: runtimeWith([sessionView('t1', 'live')]),
      bashRoute: (() =>
        new Promise((resolve) => {
          holder.release = () => resolve(okPrompt);
        })) as unknown as PromptDeps['bashRoute'],
      resumeRoute: undefined,
    });
    const pending = routes['session/prompt']({ threadId: 't1', message: '! sleep 600' }).then((outcome) => {
      settled = true;
      return outcome;
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // 命令未完成前不结算：等待窗即「卡住」段
    (holder.release as (() => void) | null)?.();
    expect(await pending).toEqual({ ok: true, data: null });
  });
});
