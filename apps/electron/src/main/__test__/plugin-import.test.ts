/** 插件源面实现测试（批准根门 + 一深度候选发现；plugin-runtime §M3）。 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginImporter } from '../plugin-import';

describe('createPluginImporter：批准根门与候选发现', () => {
  test('gate：批准根内放行；根外拒；不存在拒', async () => {
    const approved = await mkdtemp(join(tmpdir(), 'pi-approved-'));
    const other = await mkdtemp(join(tmpdir(), 'pi-other-'));
    const pluginDir = join(approved, 'my-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), '{}');
    const importer = createPluginImporter({ pickedRoots: () => [approved] });

    const inside = await importer.gate(pluginDir);
    expect(inside.ok).toBe(true);
    const outside = await importer.gate(other);
    expect(outside.ok).toBe(false);
    const missing = await importer.gate(join(approved, 'no-such'));
    expect(missing.ok).toBe(false);
  });

  test('discover：一深度 plugin.json 目录即候选；空根 → 空', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pi-root-'));
    await mkdir(join(root, 'plugin-a'), { recursive: true });
    await writeFile(join(root, 'plugin-a', 'plugin.json'), '{}');
    await mkdir(join(root, 'not-a-plugin'), { recursive: true });
    const importer = createPluginImporter({ pickedRoots: () => [root] });

    const found = await importer.discover();
    const realRoot = await realpath(root); // macOS /tmp → /private/tmp 符号链接归一（发现结果走 realpath 面）
    expect(found.ok && found.found).toEqual([{ sourcePath: join(realRoot, 'plugin-a'), origin: 'picked' }]);
    const empty = await createPluginImporter({ pickedRoots: () => [] }).discover();
    expect(empty.ok && empty.found).toEqual([]);
  });
});
