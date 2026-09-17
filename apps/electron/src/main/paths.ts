import { join } from 'node:path';

/** userData 下的落盘布局（单一真相：全部路径从这里取）。 */
export interface AppPaths {
  userDataDir: string;
  /** hub 配置目录（HUB_AGENT_DIR：models.json/credentials.json/sessions/hub-settings）。 */
  agentDir: string;
  /** 会话注册表（node:sqlite）。 */
  registryDb: string;
  /** 应用设置（不含 key）。 */
  settingsFile: string;
  /** provider key 加密存储。 */
  providerKeysFile: string;
  /** 主进程日志（尺寸截断轮转）。 */
  logFile: string;
}

export function resolveAppPaths(userDataDir: string): AppPaths {
  return {
    userDataDir,
    agentDir: join(userDataDir, 'agent'),
    registryDb: join(userDataDir, 'registry.sqlite'),
    settingsFile: join(userDataDir, 'settings.json'),
    providerKeysFile: join(userDataDir, 'provider-keys.json'),
    logFile: join(userDataDir, 'main.log'),
  };
}

/** userData 数据根：缺省 home 下 .pai；PAI_USER_DATA_DIR 非空整体重定向
 * （空串视为未设置，避免把数据根清成空路径；worktree 并行实例各用独立数据区）。 */
export function resolveUserDataDir(env: { PAI_USER_DATA_DIR?: string }, home: string): string {
  const override = env.PAI_USER_DATA_DIR;
  return override !== undefined && override.length > 0 ? override : join(home, '.pai');
}
