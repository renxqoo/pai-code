/**
 * 覆盖率真门禁（T40 §5 前置项根治）：bun 1.4.2 不执行 bunfig coverageThreshold
 * （实验证实：要求 100%、实测 50%、exit 0 静默放过）——声明式阈值是假门禁。
 * 本脚本是 test 入口的唯一真相：spawn bun test --coverage（单次运行）、透传全部
 * 输出与退出码、解析 All files 行的 funcs/lines，低于基线即红。
 * 基线 = 只升不降纪律的当前锚点（W1 后实测）；覆盖率提升后手动抬升基线。
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** 只升不降基线（funcs/lines，%）。抬升规矩：新实测高于基线时，把基线提到新值。 */
const FUNC_FLOOR = 82.89;
const LINE_FLOOR = 90.45;

const proc = Bun.spawnSync(["bun", "test"], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: process.env });
const output = proc.stdout.toString() + proc.stderr.toString();
process.stdout.write(proc.stdout.toString());
process.stderr.write(proc.stderr.toString());

if (proc.exitCode !== 0) {
  process.stderr.write(`\ncoverage-gate: tests failed (exit ${proc.exitCode})\n`);
  // 信号击杀（SIGKILL/OOM）exitCode 为 null：process.exit(null) 退出码 0 = 假绿——保真到 1
  process.exit(proc.exitCode ?? 1);
}

const match = output.match(/^All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/m);
if (match === null) {
  process.stderr.write("\ncoverage-gate: coverage table missing — bunfig [test] coverage 被关闭或输出格式变化\n");
  process.exit(1);
}
const funcs = Number(match[1]);
const lines = Number(match[2]);
const failures: string[] = [];
if (funcs < FUNC_FLOOR) failures.push(`funcs ${funcs.toFixed(2)} < ${FUNC_FLOOR}`);
if (lines < LINE_FLOOR) failures.push(`lines ${lines.toFixed(2)} < ${LINE_FLOOR}`);

if (failures.length > 0) {
  process.stderr.write(`\ncoverage-gate: FAIL — ${failures.join("; ")}（只升不降；补测试或抬升前先达基线）\n`);
  process.exit(1);
}
process.stdout.write(`\ncoverage-gate: PASS — funcs ${funcs.toFixed(2)} ≥ ${FUNC_FLOOR}, lines ${lines.toFixed(2)} ≥ ${LINE_FLOOR}\n`);
