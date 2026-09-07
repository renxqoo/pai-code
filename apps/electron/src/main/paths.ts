import { join } from 'node:path';

/** userData 下的落盘布局（单一真相：全部路径从这里取）。 */
export interface AppPaths {
  userDataDir: string;
  /** pai-cli 配置目录（PI_CODING_AGENT_DIR：models.json/auth.json/sessions/规则）。 */
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
