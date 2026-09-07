import type { HubFrame } from './hub-protocol';
import type { PaiCommand } from './commands';

/** pai-cli host 进程装配输入（apps/electron 组合根构造后注入）。 */
export interface HostRuntimeConfig {
  /** 运行 pai-cli 的 bun 可执行文件。 */
  bunPath: string;
  /** pai-cli 入口（src/cli.ts 或构建产物 cli.js）。 */
  hubEntry: string;
  /** PI_CODING_AGENT_DIR：配置目录（models.json/auth.json/sessions）。 */
  agentDir: string;
  /** 每次 spawn 前解析的增量环境（provider key 注入；key 可变，故为函数）。 */
  buildEnv(): Record<string, string>;
  /** host 工作目录（仅影响缺省 thread cwd）。 */
  cwd?: string;
}

/** host 命令应答（response 帧的收窄形态；pending 关联由实现负责）。 */
export type HostCommandOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** host 进程相位（监督状态机的对外投影）。 */
export type HostPhase = 'starting' | 'ready' | 'restarting' | 'failed';

/**
 * pai-cli 宿主原语（实现：infra/host-process）。
 * request 负责 id 关联与超时；非 response 帧经 onFrame 交付；
 * 挂死检测（>10s 无心跳）由实现负责并驱动重启回调。
 */
export interface HostProcessPort {
  request(command: PaiCommand, timeoutMs?: number): Promise<HostCommandOutcome>;
  onFrame(cb: (frame: HubFrame) => void): () => void;
  onPhase(cb: (phase: HostPhase) => void): () => void;
  /** 显式重启（配置变更等）：与挂死重启同一链路（杀组→重spawn→恢复钩子）。 */
  restart(reason: string): Promise<void>;
  /** 优雅停机：stdin EOF → 等 exit（上限内）→ SIGKILL 进程组兜底。 */
  dispose(): Promise<void>;
  /** 只读诊断：当前相位与 host stderr 尾部（排障用）。 */
  readonly phase: HostPhase;
  diagnostics(): { stderrTail: string };
}

/** 会话注册表行：窗口打开的会话（恢复链与侧栏的真相源，实现：infra/registry-store）。 */
export interface SessionRow {
  /** 主键 = pai-cli threadId（fork/clone 换 id 时整行替换）。 */
  threadId: string;
  sessionPath: string | null;
  cwd: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface RegistryStorePort {
  list(): SessionRow[];
  upsert(row: SessionRow): void;
  get(threadId: string): SessionRow | null;
  remove(threadId: string): void;
  close(): void;
}
