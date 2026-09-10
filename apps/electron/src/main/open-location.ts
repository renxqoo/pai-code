import { execFile } from 'node:child_process';

/**
 * 在系统工具中打开已知项目目录（顶栏项目菜单的执行面）：
 * finder = 文件管理器、terminal = 终端、editor = 编辑器 CLI。
 * 全部 execFile 无 shell、超时、输出上限；编辑器命令探测结果进程内缓存。
 * 失败走判别联合 reason（editor_not_found/terminal_not_found 不静默换目标）。
 */

export type OpenTarget = 'finder' | 'terminal' | 'editor';
export type OpenOutcome = { ok: true; data: null } | { ok: false; reason: string };

/** 单命令执行结果：code=null 表示进程未正常退出（error 见 kind）。 */
export type RunResult = { code: number | null; kind: RunErrorKind | null };
export type RunErrorKind = 'timeout' | 'output_too_large' | 'spawn_failed';

export type Run = (file: string, args: readonly string[]) => Promise<RunResult>;

const OPEN_TIMEOUT_MS = 5000;
const OPEN_MAX_BUFFER = 64 * 1024;

/** 默认执行器：execFile（无 shell）+ 超时 + 输出上限（只关心退出码，输出丢弃）。 */
const runExec: Run = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: OPEN_TIMEOUT_MS, maxBuffer: OPEN_MAX_BUFFER, windowsHide: true },
      (error, _stdout, _stderr) => {
        if (error === null) {
          resolve({ code: 0, kind: null });
          return;
        }
        const failure = error as { code?: unknown; killed?: unknown; signal?: unknown };
        const kind: RunErrorKind | null =
          failure.killed === true || (typeof failure.signal === 'string' && failure.signal.length > 0)
            ? 'timeout'
            : failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
              ? 'output_too_large'
              : typeof failure.code === 'number'
                ? null
                : 'spawn_failed';
        resolve({ code: typeof failure.code === 'number' ? failure.code : null, kind });
      },
    );
  });

/** 编辑器候选（去重保序）：已知 GUI CLI 优先，用户 env 指定殿后但被尊重；
 * env 值可能带参数（VISUAL='code -w'），只取首个空白分隔的可执行名。 */
export function editorCandidates(env: { VISUAL?: string | undefined; EDITOR?: string | undefined }): string[] {
  const firstToken = (value: string | undefined): string | undefined => {
    const token = value?.trim().split(/\s+/)[0];
    return token !== undefined && token.length > 0 ? token : undefined;
  };
  const names = ['code', 'cursor', 'zed', firstToken(env.VISUAL), firstToken(env.EDITOR)];
  return [...new Set(names.filter((name): name is string => typeof name === 'string' && name.length > 0))];
}

/** darwin 应用名兜底（与 CLI 层同偏好序）：编辑器装了应用但没装 CLI 链接时
 * （如 Zed 需手动 Install CLI 且常落在 GUI 进程 PATH 之外），open -a 直接拉应用。 */
const EDITOR_APPS_DARWIN = ['Visual Studio Code', 'Cursor', 'Zed'] as const;

/**
 * Windows 终端链的 cwd 安全校验：cmd.exe 会把 /c 后的参数串重新按命令行解析，
 * `&` `|` `<` `>` `^` `%` `"` 是命令元字符（目录名合法字符）——含其一即拒绝
 * （execFile 无 shell 防不住这一层，Node 只对含空格参数加引号）。
 */
export function isSafeWindowsCwd(cwd: string): boolean {
  if (cwd.length === 0) return false;
  return !/[&|^<>%"]/.test(cwd);
}

export type OpenLocationDeps = {
  run?: Run;
  /** 平台注入（缺省 process.platform）。 */
  platform?: NodeJS.Platform;
  /** 环境注入（缺省 process.env）；只读 VISUAL/EDITOR。 */
  env?: { VISUAL?: string | undefined; EDITOR?: string | undefined };
};

const failureReason = (kind: RunErrorKind): string =>
  kind === 'timeout'
    ? 'open_failed:timeout'
    : kind === 'output_too_large'
      ? 'open_failed:output_too_large'
      : 'open_failed:spawn';

export function createOpenLocation(deps: OpenLocationDeps = {}) {
  const run = deps.run ?? runExec;
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;

  /** 编辑器命令探测缓存（null = 已判定不存在；undefined = 未探测）。
   * 只缓存正结果：装好 CLI 后无须重启应用即可命中（负缓存会让「安装后重试」永远失败）。 */
  let editorCommand: string | null | undefined;

  const ok = (): OpenOutcome => ({ ok: true, data: null });
  const fail = (result: RunResult): OpenOutcome => ({
    ok: false,
    reason: result.kind === null ? 'open_failed:exit' : failureReason(result.kind),
  });

  const openFinder = async (cwd: string): Promise<OpenOutcome> => {
    const { file, args } =
      platform === 'win32'
        ? { file: 'explorer', args: [cwd] }
        : platform === 'linux'
          ? { file: 'xdg-open', args: [cwd] }
          : { file: 'open', args: [cwd] };
    const result = await run(file, args);
    // explorer 对「窗口已打开」返回 1（成功语义）；其余平台以退出码 0 为成功
    if (result.kind === null && (result.code === 0 || (platform === 'win32' && result.code === 1))) return ok();
    return fail(result);
  };

  const openTerminal = async (cwd: string): Promise<OpenOutcome> => {
    if (platform === 'darwin') {
      const result = await run('open', ['-a', 'Terminal', cwd]);
      return result.code === 0 && result.kind === null ? ok() : fail(result);
    }
    if (platform === 'win32') {
      // cmd 链的注入面：元字符目录名直接拒绝（不支持而非冒险执行）
      if (!isSafeWindowsCwd(cwd)) return { ok: false, reason: 'open_failed:unsupported_cwd' };
      const wt = await run('cmd', ['/c', 'start', 'wt', '-d', cwd]);
      if (wt.code === 0 && wt.kind === null) return ok();
      const fallback = await run('cmd', ['/c', 'start', 'cmd', '/K', `cd /d ${cwd}`]);
      return fallback.code === 0 && fallback.kind === null ? ok() : fail(fallback);
    }
    for (const terminal of ['x-terminal-emulator', 'gnome-terminal', 'konsole']) {
      const result = await run(terminal, ['--workdir', cwd]);
      if (result.code === 0 && result.kind === null) return ok();
    }
    return { ok: false, reason: 'terminal_not_found' };
  };

  /** 编辑器命令解析：候选逐一 --version 探活（退出码 0 即可用），结果缓存。 */
  const resolveEditor = async (): Promise<string | null> => {
    if (editorCommand !== undefined) return editorCommand;
    for (const candidate of editorCandidates(env)) {
      const probe = await run(candidate, ['--version']);
      if (probe.code === 0 && probe.kind === null) {
        editorCommand = candidate;
        return candidate;
      }
    }
    // 负结果不落缓存：下一次 open 重新探测（「安装后重试」无须重启应用）
    editorCommand = undefined;
    return null;
  };

  /**
   * 编辑器打开：CLI 层（探活缓存）失败或不命中时，darwin 再走应用名兜底
   * （open -a，应用未安装时干净退出非零）。两层全空才报 editor_not_found；
   * CLI 层已有结果但打开失败时保留其失败原因（应用层也救不回才上抛）。
   */
  const openEditor = async (cwd: string): Promise<OpenOutcome> => {
    const editor = await resolveEditor();
    let cliFailure: OpenOutcome | null = null;
    if (editor !== null) {
      const result = await run(editor, [cwd]);
      if (result.code === 0 && result.kind === null) return ok();
      cliFailure = fail(result);
    }
    if (platform === 'darwin') {
      for (const app of EDITOR_APPS_DARWIN) {
        const result = await run('open', ['-a', app, cwd]);
        if (result.code === 0 && result.kind === null) return ok();
      }
    }
    return cliFailure ?? { ok: false, reason: 'editor_not_found' };
  };

  const open = async (cwd: string, target: OpenTarget): Promise<OpenOutcome> => {
    if (target === 'finder') return openFinder(cwd);
    if (target === 'terminal') return openTerminal(cwd);
    return openEditor(cwd);
  };

  return { open };
}

export type OpenLocation = ReturnType<typeof createOpenLocation>;
