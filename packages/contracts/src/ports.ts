import type { HubCommand, HubFrame } from './hub-protocol';

/** pai-cli host 进程装配输入（apps/electron 组合根构造后注入）。 */
export interface HostRuntimeConfig {
  /** 运行 pai-cli 的 bun 可执行文件。 */
  bunPath: string;
  /** pai-cli 入口（src/cli.ts 或构建产物 cli.js）。 */
  hubEntry: string;
  /** PI_CODING_AGENT_DIR：配置目录（models.json/auth.json/sessions）。 */
  agentDir: string;
  /** 额外环境变量（provider key 注入等；进程环境之外的增量）。 */
  env: Record<string, string>;
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
  request(command: HubCommand, timeoutMs?: number): Promise<HostCommandOutcome>;
  onFrame(cb: (frame: HubFrame) => void): () => void;
  onPhase(cb: (phase: HostPhase) => void): () => void;
  /** 优雅停机：stdin EOF → 等 exit（上限内）→ SIGKILL 进程组兜底。 */
  dispose(): Promise<void>;
  /** 只读诊断：当前相位与挂死重启计数。 */
  readonly phase: HostPhase;
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
