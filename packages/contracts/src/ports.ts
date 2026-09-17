import type { HubFrame } from './hub-protocol';
import type { PaiCommand } from './commands';

/** hub host 进程装配输入（apps/electron 组合根构造后注入）。 */
export interface HostRuntimeConfig {
  /** 运行 hub 的 bun 可执行文件；直执行形态（hubEntry null）下 = hub 编译产物本体。 */
  bunPath: string;
  /** hub 入口脚本（源码 .ts 或产物 .js）；null = 直执行形态（spawn(bunPath, [])，bunPath 须为自包含可执行）。 */
  hubEntry: string | null;
  /** HUB_AGENT_DIR：配置目录（models.json/credentials.json/sessions）。 */
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
 * hub 宿主原语（实现：infra/host-process）。
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
  /** 只读诊断：当前相位、host stderr 尾部与重启事实（监控页/排障用）。 */
  readonly phase: HostPhase;
  diagnostics(): HostDiagnostics;
}

/** host 进程监督事实（create-host-process 单一真相；监控页快照的输入）。 */
export interface HostDiagnostics {
  stderrTail: string;
  /** 本次宿主进程生命周期内的重启次数（挂死/退出/手动同计）。 */
  restartCount: number;
  /** 最近一次重启原因（'hang' | 'exit' | 'manual:*'）；null = 从未重启。 */
  lastRestartCause: string | null;
  /** 最近一次重启时刻（ms）；null = 从未重启。 */
  lastRestartAt: number | null;
}

/** 会话注册表行：窗口打开的会话（恢复链与侧栏的真相源，实现：infra/registry-store）。 */
export interface SessionRow {
  /** 主键 = hub threadId（fork/clone 换 id 时整行替换）。 */
  threadId: string;
  sessionPath: string | null;
  cwd: string;
  title: string;
  /** 会话信任态（thread/start|resume 的 trusted 生效值；null = 未记录，按非受信处理）。 */
  trusted: boolean | null;
  createdAt: number;
  /** 会话最后活动时间（SessionView.lastActivityAt 的持久镜像）：只有新建/fork/turn 活动推进；恢复/改名等元数据写不推进。 */
  updatedAt: number;
  /** 免闲置回收标志（注册表持久真相；hub 表项标志是运行期镜像，会话 live 化时 re-assert）。 */
  keepalive: boolean;
}

export interface RegistryStorePort {
  list(): SessionRow[];
  upsert(row: SessionRow): void;
  get(threadId: string): SessionRow | null;
  remove(threadId: string): void;
  close(): void;
}
