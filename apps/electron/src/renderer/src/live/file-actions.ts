import { createApiClient } from '@paiapp/api/client';
import type { ApiOutcome } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';

/**
 * 项目文件读取能力（文件查看 pane 数据源）：主进程侧持有目录门禁与
 * 路径白名单（file-read.ts），本层只做空 cwd 早退与结果透传。
 */

/** 读取项目文件文本（超 2MiB 截断并标记；失败 error 交调用方转文案）。 */
export async function readProjectFile(client: BridgeClient, cwd: string, path: string): Promise<ApiOutcome<'file/read'>> {
  const api = createApiClient(client);
  if (cwd.length === 0 || path.length === 0) return { ok: false, error: { kind: 'invalid_params', message: 'invalid_path' } };
  return api.files.read({ cwd, path });
}
