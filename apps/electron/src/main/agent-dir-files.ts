import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * agentDir 受控文件面：只服务既定文件名白名单（裸名、无路径分隔符），
 * 从构造上排除路径逃逸；写走 tmp+rename 原子路径。
 * hub 对这些文件热读（如 permission-rules.json 每次工具调用重读），
 * 坏/缺文件由读取侧降级，不让主进程崩溃。
 */

/** 既定文件集合：新增文件面 = 功能面变化，须同步方案文档。 */
const ALLOWED_FILES: ReadonlySet<string> = new Set(['permission-rules.json']);

export function createAgentDirFiles(agentDir: string) {
  const resolveAllowed = (relPath: string): string | null =>
    ALLOWED_FILES.has(relPath) ? join(agentDir, relPath) : null;

  return {
    /** 读 JSON；缺文件/坏 JSON/白名单外 → null（调用方决定降级形态）。 */
    readJson(relPath: string): unknown {
      const file = resolveAllowed(relPath);
      if (file === null || !existsSync(file)) return null;
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as unknown;
      } catch {
        return null;
      }
    },
    /** 原子写 JSON；白名单外或写失败 → false。 */
    writeJsonAtomic(relPath: string, data: unknown): boolean {
      const file = resolveAllowed(relPath);
      if (file === null) return false;
      try {
        mkdirSync(dirname(file), { recursive: true });
        const tempFile = `${file}.tmp`;
        writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`);
        renameSync(tempFile, file);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type AgentDirFiles = ReturnType<typeof createAgentDirFiles>;
