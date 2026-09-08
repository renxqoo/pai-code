import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

const projects: string[] = [];
for (const dir of [join(root, 'packages'), join(root, 'apps')]) {
  for (const name of readdirSync(dir)) {
    const tsconfig = join(dir, name, 'tsconfig.json');
    if (statSync(tsconfig).isFile()) projects.push(tsconfig);
  }
}

let failed = false;
for (const project of projects) {
  const proc = Bun.spawnSync(['bun', 'x', 'tsc', '--noEmit', '-p', project], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (proc.exitCode !== 0) {
    console.error(`[typecheck] failed: ${project}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
