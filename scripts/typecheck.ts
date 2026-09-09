import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

// 只枚举子目录：Finder 会在层级里留 .DS_Store 之类非目录噪音文件，
// 不过滤会让 statSync(<file>/tsconfig.json) 直接 ENOTDIR 崩掉。
const projects: string[] = [];
for (const dir of [join(root, "packages"), join(root, "apps")]) {
  for (const name of readdirSync(dir)) {
    if (!statSync(join(dir, name)).isDirectory()) continue;
    const tsconfig = join(dir, name, "tsconfig.json");
    if (statSync(tsconfig).isFile()) projects.push(tsconfig);
  }
}

let failed = false;
for (const project of projects) {
  const proc = Bun.spawnSync(["bun", "x", "tsc", "--noEmit", "-p", project], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    console.error(`[typecheck] failed: ${project}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
