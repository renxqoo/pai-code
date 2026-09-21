import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileLogger } from "../file-settings";

/**
 * 红测：日志轮转销毁全部历史（file-settings.ts createFileLogger）。
 *
 * 声称的 Bug：超限轮转的实现是 `truncateSync(logFile, 0)` 之后再
 * `renameSync(logFile, logFile.1)`——先把主日志截断为空、再把空文件改名为
 * 归档。结果 main.log.1 恒为空文件，每次轮转静默销毁 1MB 审计/诊断历史
 * （权限应答等安全敏感动作的 audit 行同样随轮转湮灭）。
 * 注释宣称的语义是「超限轮转：main.log → main.log.1」，即 .1 应保留轮转前内容。
 *
 * 触发序列：写入超过 maxBytes 的日志行 → 下一次 log() 触发轮转 →
 * 断言归档文件包含轮转前的历史内容。当前实现下断言失败（红）。
 */

describe("createFileLogger 轮转不丢历史", () => {
  test("超限轮转后 main.log.1 保留轮转前的日志内容", () => {
    const dir = mkdtempSync(join(tmpdir(), "pai-red-logger-"));
    try {
      const logFile = join(dir, "main.log");
      const logger = createFileLogger(logFile, 16);

      logger.log("first audit line");
      // 第一次写后 size（时间戳 24 + 空格 + 16 + 换行 = 41 字节）> maxBytes=16，
      // 本次调用触发轮转：truncate → rename → 追加第二行到新 main.log
      logger.log("second audit line");

      const rotated = readFileSync(`${logFile}.1`, "utf8");
      const current = readFileSync(logFile, "utf8");

      // 主日志照常续写
      expect(current).toContain("second audit line");
      // 归档必须保留轮转前的内容（时间戳前缀清洗不影响消息文本）
      expect(rotated).toContain("first audit line");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
