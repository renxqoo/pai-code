import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

import type { SessionRow } from '@paiapp/contracts';
import type { PaiRuntime } from './pai-runtime';

/**
 * 会话恢复/纳管路由组（api-routes 的 resume/register 子集）：路径白名单、trusted
 * 补全、already-open 收养（thread/list 按 path 回落——T38 实施期缺陷的回归锁定）、
 * 删行正则族与元数据补齐。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

type Command = Parameters<PaiRuntime['host']['request']>[0];

type RegistryRow = SessionRow | null;

export function resumeRoutes(deps: {
  command: (cmd: Command, timeoutMs?: number) => Promise<{ ok: true; data: unknown } | { ok: false; reason: string }>;
  fail: (reason: string) => { ok: false; reason: string };
  runtime: PaiRuntime;
  audit: (message: string) => void;
  insideSessionsRoot: (sessionPath: string) => boolean;
  findRegistryRowByPath: (sessionPath: string) => RegistryRow;
  fileMtimeMs: (path: string) => number | null;
  fillSessionMeta: (threadId: string) => void;
}): {
  'session/resume': Handler<'session/resume'>;
  'session/register': Handler<'session/register'>;
} {
  const { command, fail, runtime, audit, insideSessionsRoot, findRegistryRowByPath, fileMtimeMs, fillSessionMeta } = deps;

  /** thread/list 按 sessionPath 收养既有表项（resume 撞 already open 的回落路径）。 */
  const adoptExistingThread = async (
    sessionPath: string,
  ): Promise<{ threadId: string; cwd: string; sessionPath: string } | null> => {
    const list = await command({ type: 'thread/list' });
    if (!list.ok) return null;
    const rows = Array.isArray(list.data) ? list.data : [];
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const entry = row as Record<string, unknown>;
      if (entry['sessionPath'] === sessionPath && typeof entry['threadId'] === 'string') {
        return { threadId: entry['threadId'], cwd: typeof entry['cwd'] === 'string' ? entry['cwd'] : '', sessionPath };
      }
    }
    return null;
  };

  /** resume 收尾（resume 响应与 already-open 收养共用）：视图落表 + 换 id 整行替换 + 元数据补齐。 */
  const finishResume = (
    threadId: string,
    cwd: string,
    sessionPath: string,
    known: ReturnType<typeof findRegistryRowByPath>,
  ): { ok: true; data: ReturnType<PaiRuntime["applyStartOutcome"]> } => {
    // threadId 只信响应；标题沿用注册表行（占位视图/既有命名的延续，不回退默认标题）
    // 恢复不是会话活动：活动时间 = max(注册表行, 会话文件 mtime)——await 窗口内到达的
    // turn 事件可能已推进行/文件（帧同步派发先于本续体），不得用过期快照写回旧值；
    // 双源皆不可得（无行且 stat 失败）降级当前时刻
    const rowAtWrite = findRegistryRowByPath(sessionPath);
    const lastActivityAt = Math.max(rowAtWrite?.updatedAt ?? 0, fileMtimeMs(sessionPath) ?? 0) || Date.now();
    const view = runtime.applyStartOutcome(threadId, cwd, sessionPath, known?.title ?? runtime.defaultTitle, lastActivityAt, known?.trusted ?? false);
    if (known !== null && known.threadId !== threadId) {
      // 换 id 整行替换：旧行删除 + 旧 id 视图同步清出（与对账/启动链路同一不变量）；
      // 常驻是会话文件的属性，随行迁移到新 id（否则唤醒一次即静默丢失）
      runtime.removeSession(known.threadId);
      if (known.keepalive) runtime.setSessionKeepalive(threadId, true);
    }
    fillSessionMeta(threadId);
    return { ok: true as const, data: view };
  };

  return {
    'session/resume': async (params) => {
      // 路径白名单：只允许恢复本应用 agentDir/sessions 下的会话文件（防被攻陷渲染层任意读）
      if (!insideSessionsRoot(params.sessionPath)) return fail('session_path_forbidden');
      // hub 协议 resume 缺省 trusted=false：不传时按注册表记录补全（同文件重开保持既有信任态）
      const known = findRegistryRowByPath(params.sessionPath);
      const trusted = params.trusted ?? known?.trusted ?? false;
      if (params.trusted !== undefined || known?.trusted === true) audit(`session_trusted:resume:${params.sessionPath}:${trusted}`);
      const result = await command({
        type: 'thread/resume',
        sessionPath: params.sessionPath,
        trusted,
        ...(params.permissionMode !== undefined ? { permissionMode: params.permissionMode } : {}),
        ...(params.thinkingLevel !== undefined ? { thinkingLevel: params.thinkingLevel } : {}),
      });
      if (!result.ok) {
        if (/already open/.test(result.reason)) {
          // hub 表内已有该会话的表项（retire 后 parked / 他方 live）——resume-by-path
          // 对占用路径按设计拒绝；唤醒语义 = 按 threadId 的驱动命令自动唤醒。
          // 从 thread/list 按 path 收养既有表项，恢复链路继续。
          const adopted = await adoptExistingThread(params.sessionPath);
          if (adopted !== null) {
            return finishResume(adopted.threadId, adopted.cwd, adopted.sessionPath, known);
          }
        }
        // 会话文件被删或属旧 pai 布局（hub 词法拒绝）：与对账同语义删行，
        // 占位不再反复失败（hub 错误族：not found / no such / outside sessions dir /
        // malformed layout / cannot resume）
        if (known !== null && /not found|no such|outside sessions dir|malformed layout|cannot resume/i.test(result.reason)) {
          runtime.removeSession(known.threadId);
        }
        return fail(result.reason);
      }
      const data = result.data as { threadId?: string; cwd?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      if (threadId.length === 0) return fail('malformed_response');
      return finishResume(threadId, data.cwd ?? known?.cwd ?? '', data.sessionPath ?? params.sessionPath, known);
    },
    'session/register': async (params) => {
      // 白名单/trusted 补全同 resume。纳管 ≠ 激活：视图保持 parked 占位零副作用；会话头
      // id 与注册表行分歧（外部改写怪态）不落表不换行，交水化失败面显式暴露
      if (!insideSessionsRoot(params.sessionPath)) return fail('session_path_forbidden');
      const known = findRegistryRowByPath(params.sessionPath);
      if (known === null) return fail('unknown_session');
      if (known.trusted === true) audit(`session_trusted:register:${params.sessionPath}:true`);
      const result = await command({ type: 'thread/register', sessionPath: params.sessionPath, trusted: known.trusted ?? false });
      // 文件已删（对账之后失效）：与 resume 同语义删行，占位不再反复失败
      if (!result.ok && /not found|no such|not readable|outside sessions dir|malformed layout|cannot resume/i.test(result.reason)) runtime.removeSession(known.threadId);
      if (!result.ok) return fail(result.reason);
      const threadId = (result.data as { threadId?: string }).threadId ?? '';
      if (threadId !== known.threadId) return fail('thread_id_mismatch');
      const existing = runtime.sessions().find((row) => row.threadId === known.threadId);
      return existing === undefined ? fail('unknown_session') : { ok: true as const, data: existing };
    },
  };
}
