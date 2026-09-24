import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rgPlacedPath, rgResourcePath, seedBundledRg } from '../rg-seed';

let dir = '';
afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function makeFixture(): { resources: string; agentDir: string; logs: string[] } {
  dir = mkdtempSync(join(tmpdir(), 'pai-rg-seed-'));
  const resources = join(dir, 'resources');
  const agentDir = join(dir, 'agent');
  mkdirSync(join(resources, 'host-hub', 'bin'), { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(rgResourcePath(resources), 'fake-rg-bytes');
  chmodSync(rgResourcePath(resources), 0o755);
  const logs: string[] = [];
  return { resources, agentDir, logs };
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

describe('seedBundledRg（rg 首启放置——hub grep 硬依赖）', () => {
  it('缺席 → 从打包资源拷到 <agentDir>/bin/rg（0755）', () => {
    const f = makeFixture();
    seedBundledRg({ resourcesPath: f.resources, agentDir: f.agentDir, exists: (p) => isFile(p), isFile, log: (m) => f.logs.push(m) });
    const placed = rgPlacedPath(f.agentDir);
    expect(isFile(placed)).toBe(true);
    expect(statSync(placed).mode & 0o111).not.toBe(0); // 可执行位
  });

  it('幂等：目标在场即跳过——不覆盖（资源变更不影响已放置版本）', () => {
    const f = makeFixture();
    const placed = rgPlacedPath(f.agentDir);
    mkdirSync(join(placed, '..'), { recursive: true });
    writeFileSync(placed, 'existing-user-rg');
    seedBundledRg({ resourcesPath: f.resources, agentDir: f.agentDir, exists: (p) => isFile(p), isFile, log: (m) => f.logs.push(m) });
    expect(statSync(placed).size).toBe('existing-user-rg'.length); // 未被资源覆盖
  });

  it('dev 形态（resourcesPath null）→ no-op 不落盘', () => {
    const f = makeFixture();
    seedBundledRg({ resourcesPath: null, agentDir: f.agentDir, exists: (p) => isFile(p), isFile });
    expect(isFile(rgPlacedPath(f.agentDir))).toBe(false);
  });

  it('资源缺席 → 跳过并记日志（hub 落 PATH——不阻塞启动）', () => {
    const f = makeFixture();
    const emptyResources = join(dir, 'empty-resources');
    mkdirSync(emptyResources, { recursive: true });
    seedBundledRg({ resourcesPath: emptyResources, agentDir: f.agentDir, exists: (p) => isFile(p), isFile, log: (m) => f.logs.push(m) });
    expect(isFile(rgPlacedPath(f.agentDir))).toBe(false);
    expect(f.logs.some((l) => l.includes('resource missing'))).toBe(true);
  });

  it('放置失败（agentDir 不可写等）→ 不抛——记日志继续（PATH 兜底）', () => {
    const f = makeFixture();
    // 用一个“文件冒充 agentDir”构造 mkdir/copy 失败路径
    const fileAsAgentDir = join(dir, 'file-as-agent');
    writeFileSync(fileAsAgentDir, 'not-a-dir');
    expect(() =>
      seedBundledRg({ resourcesPath: f.resources, agentDir: fileAsAgentDir, exists: (p) => isFile(p), isFile, log: (m) => f.logs.push(m) }),
    ).not.toThrow();
    expect(f.logs.some((l) => l.includes('place failed'))).toBe(true);
  });

  it('路径口径：<agentDir>/bin/rg 与资源 host-hub/bin/rg（hub rgBinDir/打包布局同源）', () => {
    expect(rgPlacedPath('/data/.pai/agent')).toBe('/data/.pai/agent/bin/rg');
    expect(rgResourcePath('/app/Contents/Resources')).toBe('/app/Contents/Resources/host-hub/bin/rg');
  });
});
