import type { RuntimePort } from './ports';

import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError } from '../errors';
import type { SessionCommands } from '../commands/session';

import { compactInvocationOf } from './compact-lexing';

/**
 * 发送管线（session/prompt 主进程侧实现）：三分支（`! ` 直执行 → bash 命令链 /
 * /compact 词形 → compact 命令 / 其余 → hub prompt）共享前置与自愈——
 * 空舞台守卫、parked 懒唤醒（resume 收养/换轨链）、unknown_thread 恰一次
 * 重锚重投；streaming_window 受理窗口降级重试仅 prompt 分支（声明式
 * streamingBehavior 不代用户降级）。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

type SendOutcome<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function promptRoutes(deps: {
  sessionCommands: () => SessionCommands;
  fail: (error: ApiError) => { ok: false; error: ApiError };
  runtime: RuntimePort;
  /** bash 分支复用的 session/bash 路由处理器（audit/长超时档/结果收窄同一实现）。 */
  bashRoute: Handler<'session/bash'>;
  /** resume 通路晚绑定：resume 路由组挂载在路由表字面量之后（依赖 fillSessionMeta）。 */
  resumeRoute: () => Handler<'session/resume'> | undefined;
}): { 'session/prompt': Handler<'session/prompt'> } {
  const { fail, runtime } = deps;

  /** 空舞台守卫 + 懒唤醒：定址 id → 可投递 id。
   *  注册表/会话表无此行（含空串 id）= 空舞台——可行动去向优于 schema 密文；
   *  live/dead 原样投递（dead 由 hub 下条命令自动恢复）；parked 占位先经
   *  resume 唤活（resume 响应/事件同步渲染层视图），以恢复后 id 投递。 */
  const resolveTarget = async (threadId: string): Promise<{ ok: true; threadId: string } | { ok: false; error: ApiError }> => {
    const session = runtime.sessions().find((row) => row.threadId === threadId);
    if (session === undefined) return fail(appError('no_active_session'));
    if (session.state !== 'parked') return { ok: true, threadId };
    // 无会话文件的空占位不可恢复（从未有首条消息）
    if (session.sessionPath === null) return fail(appError('resume_failed'));
    const resumed = await deps.resumeRoute()?.({ sessionPath: session.sessionPath });
    if (resumed === undefined || !resumed.ok) return fail(appError('resume_failed'));
    return { ok: true, threadId: resumed.data.threadId };
  };

  /** unknown_thread 自愈：视图 live 而 hub 线程表已忘掉该 id（host 代际切换窗口/
   *  换轨在飞残留）。会话文件是持久真相——按行内 sessionPath 强制 resume 一次
   *  （走收养/换轨链）再以新 id 重投恰一次；resume 失败或重投仍败按原 error 上抛。
   *  thread_superseded（fork 换轨）不触发——防复活 fork 前状态。成功时带回实际
   *  投递 id（autoTitle 寻址用）。 */
  const retryOnUnknownThread = async <T>(
    target: string,
    requestedId: string,
    send: (threadId: string) => Promise<SendOutcome<T>>,
  ): Promise<{ ok: true; data: T; threadId: string } | { ok: false; error: ApiError }> => {
    const first = await send(target);
    if (first.ok) return { ok: true, data: first.data, threadId: target };
    if (first.error.kind !== 'unknown_thread') return first;
    const view = runtime.sessions().find((row) => row.threadId === target) ?? runtime.sessions().find((row) => row.threadId === requestedId);
    if (view?.sessionPath == null) return first;
    const reanchored = await deps.resumeRoute()?.({ sessionPath: view.sessionPath });
    if (reanchored === undefined || !reanchored.ok) return first;
    const retried = await send(reanchored.data.threadId);
    return retried.ok ? { ok: true, data: retried.data, threadId: reanchored.data.threadId } : first;
  };

  return {
    'session/prompt': async (params) => {
      const trimmed = params.message.trim();
      // 行首 `! ` 前缀（trim 后）= 直执行命令：走 bash 命令链（不进模型轮次、
      // 不支持图片——纯图 + `! ` 互斥本地先拒，附件不静默丢弃）。直执行不是会话
      // 活动：autoTitle 抑制（命令文本不作标题候选——与原渲染层链同语义）。
      // bash 结果对象不是本路由契约（输出经 bashOutput 事件与条目对账到达）。
      if (trimmed.startsWith('! ')) {
        if ((params.images?.length ?? 0) > 0) return fail(appError('bash_images_rejected'));
        const target = await resolveTarget(params.threadId);
        if (!target.ok) return fail(target.error);
        const outcome = await retryOnUnknownThread(target.threadId, params.threadId, (threadId) =>
          deps.bashRoute({ threadId, command: trimmed.slice(2).trim() }),
        );
        return outcome.ok ? { ok: true as const, data: null } : fail(outcome.error);
      }
      // /compact 词形命中 → 直发 compact 命令（D7：与 hub prompt 拦截同执行路径/同
      // 词表/同 data 三元组——app 不依赖 hub 拦截面行为对齐；响应即终态，长超时）。
      // 携图命中命令 = hub 硬拒（compact 不接受图片）——直发路径本地同口径先拒。
      const invocation = compactInvocationOf(params.message);
      if (invocation !== undefined) {
        if ((params.images?.length ?? 0) > 0) return fail(appError('compact_images_rejected'));
        const target = await resolveTarget(params.threadId);
        if (!target.ok) return fail(target.error);
        const outcome = await retryOnUnknownThread(target.threadId, params.threadId, (threadId) =>
          deps.sessionCommands().compact({ threadId, customInstructions: invocation.customInstructions }),
        );
        if (!outcome.ok) return fail(outcome.error);
        void runtime.autoTitleOnPrompt(outcome.threadId, params.message).catch(() => undefined);
        const raw = (outcome.data ?? {}) as Record<string, unknown>;
        const compactResult =
          typeof raw['summary'] === 'string' && typeof raw['replacedCount'] === 'number' && typeof raw['summaryTokens'] === 'number'
            ? { summary: raw['summary'], replacedCount: raw['replacedCount'], summaryTokens: raw['summaryTokens'] }
            : null;
        return { ok: true as const, data: compactResult };
      }
      const target = await resolveTarget(params.threadId);
      if (!target.ok) return fail(target.error);
      // 投递裁决交给 hub 的原子语义（prompt+streamingBehavior）：空闲立即发送、
      // 流式中按模式入队并在轮末自动消费。
      const send = (threadId: string, behavior?: 'steer' | 'followUp') =>
        deps.sessionCommands().prompt({
          threadId,
          message: params.message,
          streamingBehavior: behavior ?? params.streamingBehavior,
          images: params.images,
        });
      // 受理窗口竞态（hub 判定 pendingSends>0 ∨ streaming，app 的 streaming 状态来自
      // 事件流天然滞后）：恰一次自动降级重试（补 followUp），重试仍败才上抛。
      const sendWithWindowRetry = async (threadId: string): Promise<SendOutcome<unknown>> => {
        let result = await send(threadId);
        if (!result.ok && params.streamingBehavior === undefined && result.error.kind === 'streaming_window') {
          result = await send(threadId, 'followUp');
        }
        return result;
      };
      const outcome = await retryOnUnknownThread(target.threadId, params.threadId, sendWithWindowRetry);
      if (!outcome.ok) return fail(outcome.error);
      void runtime.autoTitleOnPrompt(outcome.threadId, params.message).catch(() => undefined);
      return { ok: true as const, data: null };
    },
  };
}
